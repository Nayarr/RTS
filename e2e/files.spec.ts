import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { loadEnv } from 'vite';

// Même configuration que le build testé (.env.local en local, variables d'environnement en CI).
const env = loadEnv('production', process.cwd(), 'VITE_');
const SUPABASE_URL = env.VITE_SUPABASE_URL ?? '';
const PUBLISHABLE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';
const PASSWORD = 'atelier-dev-2026';

interface UploadTicket {
  file_id: string;
  upload_url: string;
  headers: Record<string, string>;
}

async function signIn(email: string) {
  const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return client;
}

/** Appel brut de l'Edge Function « files » : statut HTTP + corps JSON. */
async function callFiles(client: SupabaseClient | null, body: unknown) {
  const token = client ? (await client.auth.getSession()).data.session?.access_token : undefined;
  const response = await fetch(`${SUPABASE_URL}/functions/v1/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: (await response.json().catch(() => null)) as Record<string, unknown>,
  };
}

/** Envoi direct vers le stockage depuis la page de l'appli : vérifie aussi le CORS du bucket. */
async function putFromBrowser(page: Page, ticket: UploadTicket, content: string, contentType?: string) {
  return page.evaluate(
    async ({ url, headers, content }) => {
      const response = await fetch(url, { method: 'PUT', headers, body: content });
      return response.status;
    },
    {
      url: ticket.upload_url,
      headers: contentType ? { 'Content-Type': contentType } : ticket.headers,
      content,
    },
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto('/connexion');
});

test('photo d’OR : réservation, envoi direct depuis le navigateur, confirmation, lecture', async ({
  page,
}) => {
  const [alice, bruno, reception] = await Promise.all([
    signIn('alice@rts.local'),
    signIn('bruno@rts.local'),
    signIn('reception@rts.local'),
  ]);
  const content = `photo-${test.info().project.name}-${Date.now()}`;

  const upload = await callFiles(alice, {
    action: 'upload',
    category: 'ro_photo',
    mime_type: 'image/jpeg',
    size_bytes: content.length,
    original_name: 'plaquettes.jpg',
  });
  expect(upload.status).toBe(201);
  const ticket = upload.body as unknown as UploadTicket;

  // Pas de confirmation tant que le fichier n'est pas arrivé
  expect((await callFiles(alice, { action: 'confirm', file_id: ticket.file_id })).status).toBe(409);

  // Le type imposé par la signature est vérifié par le stockage
  expect(await putFromBrowser(page, ticket, content, 'text/html')).toBe(403);
  expect(await putFromBrowser(page, ticket, content)).toBe(200);

  // Seule l'autrice confirme ; la taille réelle est enregistrée
  expect((await callFiles(bruno, { action: 'confirm', file_id: ticket.file_id })).status).toBe(404);
  const confirmed = await callFiles(alice, { action: 'confirm', file_id: ticket.file_id });
  expect(confirmed).toEqual({ status: 200, body: { file_id: ticket.file_id, size_bytes: content.length } });

  // Lecture : l'autrice et le bureau oui, un autre technicien non (RLS)
  const download = await callFiles(alice, { action: 'download', file_ids: [ticket.file_id] });
  const url = (download.body.urls as Record<string, string>)[ticket.file_id] ?? '';
  expect(url).toContain('X-Amz-Signature=');
  const stored = await page.evaluate(async (url) => (await fetch(url)).text(), url);
  expect(stored).toBe(content);

  const forReception = await callFiles(reception, { action: 'download', file_ids: [ticket.file_id] });
  expect(Object.keys(forReception.body.urls as object)).toEqual([ticket.file_id]);
  const forBruno = await callFiles(bruno, { action: 'download', file_ids: [ticket.file_id] });
  expect(forBruno.body.urls).toEqual({});
});

test('un fichier plus gros que la limite est refusé puis supprimé', async ({ page }) => {
  const alice = await signIn('alice@rts.local');
  const upload = await callFiles(alice, {
    action: 'upload',
    category: 'signature', // limite : 1 Mo
    mime_type: 'image/png',
    size_bytes: 1000, // taille annoncée mensongère
  });
  const ticket = upload.body as unknown as UploadTicket;
  expect(await putFromBrowser(page, ticket, 'x'.repeat(1024 * 1024 + 1))).toBe(200);

  const confirmed = await callFiles(alice, { action: 'confirm', file_id: ticket.file_id });
  expect(confirmed).toEqual({ status: 400, body: { error: 'Fichier trop volumineux (maximum 1 Mo)' } });
  const download = await callFiles(alice, { action: 'download', file_ids: [ticket.file_id] });
  expect(download.body.urls).toEqual({});
});

test('droits d’envoi : catégorie réservée, type refusé, appel anonyme', async () => {
  const [kiosk, reception] = await Promise.all([signIn('borne@rts.local'), signIn('reception@rts.local')]);

  expect(
    await callFiles(kiosk, {
      action: 'upload',
      category: 'ro_photo',
      mime_type: 'image/jpeg',
      size_bytes: 10,
    }),
  ).toEqual({ status: 403, body: { error: 'Accès refusé : envoi de ce type de fichier non autorisé' } });
  expect(
    await callFiles(reception, {
      action: 'upload',
      category: 'document_pdf',
      mime_type: 'image/png',
      size_bytes: 10,
    }),
  ).toEqual({ status: 400, body: { error: 'Type de fichier non accepté : image/png' } });
  expect((await callFiles(null, { action: 'download', file_ids: [] })).status).toBe(401);
});
