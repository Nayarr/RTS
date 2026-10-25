import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';

const env = loadEnv('production', process.cwd(), 'VITE_');
// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();
}

test('OR depuis un devis aux forfaits pneus sans lien : le technicien ne voit que « Remplacement Pneus »', async ({
  page,
}, testInfo) => {
  const plate = `PC${String(Date.now()).slice(-6)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;
  const reception = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    { auth: { persistSession: false } },
  );
  await reception.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: alice } = await reception
    .from('technicians')
    .select('id')
    .eq('display_name', 'Alice')
    .single();

  // Devis d'avant les forfaits en quantité : avant rattaché, arrière sans lien (forfaits X4 supprimés)
  const { data: quote, error } = await reception.rpc('create_quote', {
    p_client_name: 'Transports E2E',
    p_plate: plate,
    p_vehicle_type: 'pl',
  });
  if (error) throw error;
  const { data: front } = await reception
    .from('service_packages')
    .select('id')
    .eq('legacy_id', 'pneus:pl:pneu')
    .single();
  const lines = await reception.from('quote_lines').insert([
    {
      quote_id: quote.id,
      position: 0,
      line_type: 'package',
      description: 'DÉPOSE/REPOSE PNEUMATIQUE (avant)',
      unit_price: 18,
      quantity: 2,
      package_id: front?.id,
    },
    {
      quote_id: quote.id,
      position: 1,
      line_type: 'package',
      description: 'DÉPOSE/REPOSE PNEUMATIQUE X4 (arrière)',
      unit_price: 72,
      quantity: 1,
    },
    {
      quote_id: quote.id,
      position: 2,
      line_type: 'package',
      description: 'DÉPOSE/REPOSE ROUE X4 (arrière)',
      unit_price: 72,
      quantity: 1,
    },
    {
      quote_id: quote.id,
      position: 3,
      line_type: 'package',
      description: 'RECYCLAGE PNEUMATIQUE X4 (arrière)',
      unit_price: 32,
      quantity: 1,
    },
  ]);
  if (lines.error) throw lines.error;
  await reception.rpc('set_quote_response', { p_quote_id: quote.id, p_status: 'accepted' });
  const { data: orderId, error: created } = await reception.rpc('create_repair_order_from_quote', {
    p_quote_id: quote.id,
    p_technician_id: alice?.id,
  });
  if (created) throw created;

  await loginAs(page, 'alice@rts.local');
  await page.goto(`/atelier/or/${orderId}`);
  const main = page.getByRole('main');
  await expect(main.getByText('Remplacement Pneus avant')).toBeVisible();
  await expect(main.getByText('Remplacement Pneus arrière')).toBeVisible();
  await expect(main.getByText(/DÉPOSE\/REPOSE|RECYCLAGE PNEUMATIQUE/)).toHaveCount(0);
});
