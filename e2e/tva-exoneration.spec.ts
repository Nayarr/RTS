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

async function reception() {
  const api = createClient<Database>(env.VITE_SUPABASE_URL ?? '', env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '', {
    auth: { persistSession: false },
  });
  await api.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  return api;
}

test('client suisse au n° de TVA contrôlé : facture sans TVA, mention et n° du client en ligne', async ({
  page,
}, testInfo) => {
  test.slow();
  const api = await reception();
  const plate = `TV${suffix(testInfo)}`;
  const { data: order, error } = await api.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: `Transports Genève ${plate}`,
    p_requested_work: 'Freinage',
  });
  if (error) throw error;
  // Mission de l'OR (déjà dans les travaux effectués) remplacée par les travaux du test
  await api.from('ro_lines').delete().eq('repair_order_id', order.id).eq('kind', 'done');
  const clientId = order.client_id ?? '';
  await api
    .from('clients')
    .update({ billing_address: 'Rue du Rhône 1, 1204 Genève, Suisse' })
    .eq('id', clientId);
  await api.from('ro_lines').insert({
    repair_order_id: order.id,
    kind: 'done',
    line_type: 'labor',
    description: 'Contrôle freinage',
    estimated_hours: 1,
  });

  // Fiche client : n° de TVA vérifié (hors Union européenne : format contrôlé)
  await loginAs(page, 'reception@rts.local');
  await page.goto(`/clients/${clientId}`);
  const card = page.getByRole('region', { name: 'N° de TVA' });
  await card.getByLabel('N° de TVA du client').fill('CHE-123.456.789 MWST');
  await card.getByRole('button', { name: 'Vérifier' }).click();
  await expect(card.getByRole('status')).toContainText('Format correct');
  await expect(card.getByLabel('N° de TVA du client')).toHaveValue('CHE123456789MWST');

  // Brouillon : sans TVA d'office, avec la mention d'exonération
  const draft = await api.rpc('build_invoice_draft', { p_repair_order_ids: [order.id] });
  if (draft.error) throw draft.error;
  await page.goto(`/factures/${draft.data}`);
  const vat = page.getByRole('region', { name: 'TVA' });
  await expect(vat.getByRole('checkbox')).toBeChecked();
  await expect(vat.getByLabel('Mention sur la facture')).toHaveValue(/^Exonération de TVA/);
  await expect(vat).toContainText('CHE123456789MWST');

  // Décoché puis recoché : TVA remise, puis de nouveau à 0
  await vat.getByRole('checkbox').click();
  await expect(vat.getByRole('checkbox')).not.toBeChecked();
  await expect(vat.getByLabel('Mention sur la facture')).toHaveCount(0);
  await vat.getByRole('checkbox').click();
  await expect(vat.getByRole('checkbox')).toBeChecked();
  await expect(vat.getByLabel('Mention sur la facture')).toHaveValue(/^Exonération de TVA/);

  const issued = await api.rpc('issue_invoice', { p_invoice_id: draft.data });
  if (issued.error) throw issued.error;
  const { data: overview } = await api
    .from('v_invoices_overview')
    .select('total_vat')
    .eq('id', draft.data)
    .single();
  expect(overview?.total_vat).toBe(0);
  const token = await api.rpc('share_invoice', { p_invoice_id: draft.data });
  if (token.error) throw token.error;
  await page.goto(`/d/${token.data}`);
  await expect(page.getByText('N° TVA CHE123456789MWST')).toBeVisible();
  await expect(page.getByText(/^Exonération de TVA/)).toBeVisible();
});
