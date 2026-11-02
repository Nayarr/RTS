import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';
import { parisDay } from './support/dates';

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
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    { auth: { persistSession: false } },
  );
  await client.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  return client;
}

/** Échéance d'un client à quinzaine : le 15 pour une facture du 1er au 15, sinon le 1er du mois suivant. */
function fortnightDue(today: string) {
  const [year, month, day] = today.split('-').map(Number) as [number, number, number];
  const due = day <= 15 ? new Date(Date.UTC(year, month - 1, 15)) : new Date(Date.UTC(year, month, 1));
  const iso = due.toISOString().slice(0, 10);
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

test('client à quinzaine : choisi sur sa fiche, échéance de la facture le 15 ou le 1er', async ({
  page,
}, testInfo) => {
  const id = suffix(testInfo);
  const api = await reception();
  const { data: order, error } = await api.rpc('create_repair_order', {
    p_plate: `Q${id}`,
    p_vehicle_type: 'pl',
    p_client_name: `Client quinzaine ${id}`,
    p_requested_work: 'Freinage',
  });
  if (error) throw error;
  await api
    .from('clients')
    .update({ billing_address: '12 rue des Transporteurs, 95190 Goussainville' })
    .eq('id', order.client_id ?? '');

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/clients/${order.client_id}`);
  await page.getByLabel('Type de compte').selectOption('Règlement à quinzaine (le 15 et le 1er)');
  await page.getByRole('button', { name: 'Enregistrer' }).first().click();
  await expect(
    page.getByText('Règlement à quinzaine (le 15 et le 1er)', { exact: true }).first(),
  ).toBeVisible();

  const work = await api.from('ro_lines').insert({
    repair_order_id: order.id,
    kind: 'done',
    line_type: 'labor',
    description: 'Remplacement disques avant',
    estimated_hours: 1,
  });
  if (work.error) throw work.error;
  const draft = await api.rpc('build_invoice_draft', { p_repair_order_ids: [order.id] });
  if (draft.error) throw draft.error;
  const issued = await api.rpc('issue_invoice', { p_invoice_id: draft.data });
  if (issued.error) throw issued.error;

  await page.goto(`/factures/${draft.data}`);
  await expect(page.getByText(`Échéance ${fortnightDue(parisDay())}`).first()).toBeVisible();
  await expect(page.getByText('Client règlement à quinzaine (le 15 et le 1er)')).toBeVisible();
});
