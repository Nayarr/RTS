import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
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

const suffix = (testInfo: TestInfo) =>
  `${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-7)}`;

/** Facture émise d'un OR fait par Alice (API : réception). */
async function invoiceFromAliceOrder(plate: string) {
  const api = createClient<Database>(env.VITE_SUPABASE_URL ?? '', env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '', {
    auth: { persistSession: false },
  });
  await api.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: alice } = await api.from('technicians').select('id').eq('display_name', 'Alice').single();
  const { data: order, error } = await api.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: `Client salarié ${plate}`,
    p_requested_work: 'Freinage',
    p_technician_id: alice?.id,
  });
  if (error) throw error;
  await api
    .from('clients')
    .update({ billing_address: '12 rue des Transporteurs, 95190 Goussainville' })
    .eq('id', order.client_id ?? '');
  await api.from('ro_lines').insert({
    repair_order_id: order.id,
    kind: 'done',
    line_type: 'labor',
    description: 'Remplacement disques avant',
    estimated_hours: 2,
  });
  const draft = await api.rpc('build_invoice_draft', { p_repair_order_ids: [order.id] });
  if (draft.error) throw draft.error;
  const issued = await api.rpc('issue_invoice', { p_invoice_id: draft.data });
  if (issued.error) throw issued.error;
  return draft.data;
}

test('salarié des lignes : prérempli depuis l’OR, changé par la direction, gardé dans l’historique', async ({
  page,
}, testInfo) => {
  const invoiceId = await invoiceFromAliceOrder(`SL${suffix(testInfo)}`);

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/factures/${invoiceId}`);
  await expect(page.getByRole('heading', { name: /Facture/ }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Salariés des lignes' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Se déconnecter' }).first().click();

  await loginAs(page, 'direction@rts.local');
  await page.goto(`/factures/${invoiceId}`);
  const card = page.getByRole('region', { name: 'Salariés des lignes' });
  const select = card.getByLabel('Salarié : Remplacement disques avant');
  await expect(select.locator('option:checked')).toHaveText('Alice');
  await select.selectOption({ label: 'Réception RTS (réception)' });
  await expect(card.getByRole('list', { name: 'Historique des salariés' })).toContainText(
    'Remplacement disques avant : Alice → Réception RTS',
  );
  await page.reload();
  await expect(card.getByLabel('Salarié : Remplacement disques avant').locator('option:checked')).toHaveText(
    'Réception RTS (réception)',
  );
});
