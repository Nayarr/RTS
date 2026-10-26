import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';
import { sql } from './support/db';

const env = loadEnv('production', process.cwd(), 'VITE_');
// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';
// IBAN d'exemple de la norme (aucun compte réel)
const IBAN = 'FR1420041010050500013M02606';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();
}

const suffix = (testInfo: TestInfo) =>
  `${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-7)}`;

/** Facture émise et partagée en ligne (API : réception). */
async function sharedInvoice(plate: string) {
  const api = createClient<Database>(env.VITE_SUPABASE_URL ?? '', env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '', {
    auth: { persistSession: false },
  });
  await api.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: order, error } = await api.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: `Client RIB ${plate}`,
    p_requested_work: 'Freinage',
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
    description: 'Contrôle freinage',
    estimated_hours: 1,
  });
  const draft = await api.rpc('build_invoice_draft', { p_repair_order_ids: [order.id] });
  if (draft.error) throw draft.error;
  const issued = await api.rpc('issue_invoice', { p_invoice_id: draft.data });
  if (issued.error) throw issued.error;
  const token = await api.rpc('share_invoice', { p_invoice_id: draft.data });
  if (token.error) throw token.error;
  return { id: draft.data, token: token.data };
}

test.describe.configure({ mode: 'serial' });

test('RIB saisi dans les réglages, affiché sur la facture en ligne ; plus de LCR au paiement', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Réglage de l’entreprise : une seule fois');
  test.slow();
  const invoice = await sharedInvoice(`RIB${suffix(testInfo)}`);
  try {
    await loginAs(page, 'direction@rts.local');
    await page.goto('/reglages?onglet=entreprise');
    await page.getByLabel('IBAN (imprimé sur les factures)').fill('fr14 2004 1010 0505 0001 3m02 607');
    await page.getByLabel('BIC').fill('bnpafrpp');
    await page.getByRole('button', { name: 'Enregistrer' }).first().click();
    await expect(page.getByText('IBAN invalide : vérifie les caractères')).toBeVisible();
    await page.getByLabel('IBAN (imprimé sur les factures)').fill('fr14 2004 1010 0505 0001 3m02 606');
    await page.getByRole('button', { name: 'Enregistrer' }).first().click();
    await expect.poll(() => sql('select iban || bic from public.company_settings')).toBe(`${IBAN}BNPAFRPP`);

    // Paiement : plus de LCR / traite parmi les moyens proposés
    await page.goto(`/factures/${invoice.id}`);
    await page.getByRole('button', { name: /Enregistrer un paiement/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Paiement' });
    await expect(dialog.getByLabel('Mode').locator('option')).toHaveText([
      'Virement',
      'Chèque',
      'Carte bancaire',
      'Espèces',
      'Prélèvement',
    ]);
    await page.keyboard.press('Escape');

    // Facture en ligne du client : règlement par virement
    await page.goto(`/d/${invoice.token}`);
    await expect(
      page.getByText(/Règlement par virement : IBAN FR14 2004 1010 0505 0001 3M02 606 · BIC BNPAFRPP/),
    ).toBeVisible();
  } finally {
    sql('update public.company_settings set iban = null, bic = null');
  }
});
