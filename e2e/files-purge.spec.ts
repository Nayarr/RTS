import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';

const env = loadEnv('production', process.cwd(), 'VITE_');
const API_URL = env.VITE_SUPABASE_URL ?? '';
const PASSWORD = 'atelier-dev-2026';
// Secret LOCAL des tâches planifiées (supabase/config.toml et seed.sql), jamais utilisé en production.
const CRON_SECRET = 'rts-local-cron-secret-0000';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

async function signIn(email: string) {
  const client = createClient<Database>(API_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '', {
    auth: { persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return client;
}

/** Edge Function « files » (envoi, confirmation, lien de lecture), comme le fait l'appli. */
async function callFiles<T>(client: Awaited<ReturnType<typeof signIn>>, body: Record<string, unknown>) {
  const { data, error } = (await client.functions.invoke('files', { body })) as {
    data: T | null;
    error: Error | null;
  };
  if (error || !data) throw error ?? new Error('Réponse vide');
  return data;
}

const purge = (secret: string) =>
  fetch(`${API_URL}/functions/v1/files-purge`, { method: 'POST', headers: { 'x-cron-secret': secret } });

test('la purge refuse tout appel sans le secret des tâches planifiées', async () => {
  expect((await purge('mauvais-secret-de-test')).status).toBe(401);
  expect((await fetch(`${API_URL}/functions/v1/files-purge`, { method: 'POST' })).status).toBe(401);
});

test('une photo retirée d’un OR est effacée du stockage par la purge', async () => {
  const plate = `PU-${test.info().project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-5)}`;

  // OR assigné à Alice par la réception
  const reception = await signIn('reception@rts.local');
  const { data: alice } = await reception
    .from('technicians')
    .select('id')
    .eq('display_name', 'Alice')
    .single();
  const { data: order, error: orderError } = await reception.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: `Purge ${plate}`,
    p_requested_work: 'Purge des fichiers',
    p_technician_id: alice?.id,
  });
  if (orderError) throw orderError;

  // Alice envoie une photo dans le stockage (comme l'appli) et la rattache à l'OR
  const tech = await signIn('alice@rts.local');
  const upload = await callFiles<{ file_id: string; upload_url: string; headers: Record<string, string> }>(
    tech,
    { action: 'upload', category: 'ro_photo', mime_type: 'image/png', size_bytes: PNG.length },
  );
  const put = await fetch(upload.upload_url, { method: 'PUT', headers: upload.headers, body: PNG });
  expect(put.ok).toBe(true);
  await callFiles(tech, { action: 'confirm', file_id: upload.file_id });
  const { data: photo, error: photoError } = await tech
    .from('ro_photos')
    .insert({ repair_order_id: order.id, file_id: upload.file_id, label: 'Face avant' })
    .select('id')
    .single();
  if (photoError) throw photoError;

  // Lien direct vers l'objet (valable 1 h) : l'image est bien dans le stockage
  const download = await callFiles<{ urls: Record<string, string> }>(tech, {
    action: 'download',
    file_ids: [upload.file_id],
  });
  const objectUrl = download.urls[upload.file_id] ?? '';
  expect((await fetch(objectUrl)).status).toBe(200);

  // Photo retirée puis purge de la nuit : l'objet n'existe plus, même avec le lien signé
  await tech.from('ro_photos').delete().eq('id', photo.id);
  const response = await purge(CRON_SECRET);
  expect(response.status).toBe(200);
  await expect.poll(async () => (await fetch(objectUrl)).status).toBe(404);
});
