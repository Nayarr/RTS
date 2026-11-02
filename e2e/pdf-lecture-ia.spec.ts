import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';
import { sql } from './support/db';

const env = loadEnv('production', process.cwd(), 'VITE_');
// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';
// PDF minimal : procès-verbal du contrôle technique reçu par mail.
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\n' +
    'trailer<</Root 1 0 R>>\n%%EOF\n',
);

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();
}

async function signedIn(email: string) {
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      auth: { persistSession: false },
    },
  );
  await client.auth.signInWithPassword({ email, password: PASSWORD });
  return client;
}

/** OR assigné à Alice (API : réception). */
async function orderForAlice(plate: string) {
  const reception = await signedIn('reception@rts.local');
  const { data: alice } = await reception
    .from('technicians')
    .select('id')
    .eq('display_name', 'Alice')
    .single();
  const { data, error } = await reception.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: 'Transports E2E',
    p_requested_work: 'Contrôle technique',
    p_technician_id: alice?.id,
  });
  if (error) throw error;
  return data;
}

test('contrôle technique importé en PDF : photo obligatoire remplie, PDF ouvert depuis les photos côté bureau', async ({
  page,
  browser,
}, testInfo) => {
  const plate = `CP${String(Date.now()).slice(-7)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;
  const order = await orderForAlice(plate);
  await loginAs(page, 'alice@rts.local');
  await page.goto(`/atelier/or/${order.id}`);

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Importer le contrôle technique (photo ou PDF)' }).click();
  await (await chooser).setFiles({ name: 'proces-verbal.pdf', mimeType: 'application/pdf', buffer: PDF });

  // PDF gardé tel quel comme photo du contrôle technique de l'OR
  await expect
    .poll(
      () =>
        sql(`select f.mime_type from public.ro_photos p join public.files f on f.id = p.file_id
             where p.repair_order_id = '${order.id}' and p.label = 'Contrôle technique'`),
      { timeout: 15_000 },
    )
    .toBe('application/pdf');

  // Côté bureau : vignette PDF qui ouvre le document, plus de photo manquante
  const office = await browser.newPage();
  await loginAs(office, 'reception@rts.local');
  await office.goto(`/or/${order.id}`);
  const pdf = office.getByRole('link', { name: 'Ouvrir le PDF « Contrôle technique »' });
  await expect(pdf).toBeVisible();
  await expect(pdf).toHaveAttribute('target', '_blank');
});
