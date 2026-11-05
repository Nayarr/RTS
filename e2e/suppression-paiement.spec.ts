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

/** Facture émise de 324 € TTC (3 h à 90 € HT) entièrement payée en deux fois (API : réception). */
async function createPaidInvoice(plate: string, clientName: string) {
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    { auth: { persistSession: false } },
  );
  await client.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: order, error } = await client.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: clientName,
    p_requested_work: 'Freinage',
  });
  if (error) throw error;
  await client
    .from('clients')
    .update({ billing_address: '12 rue des Transporteurs, 95190 Goussainville' })
    .eq('id', order.client_id ?? '');
  const work = await client.from('ro_lines').insert({
    repair_order_id: order.id,
    kind: 'done',
    line_type: 'labor',
    description: 'Remplacement disques avant',
    estimated_hours: 3,
  });
  if (work.error) throw work.error;
  const draft = await client.rpc('build_invoice_draft', { p_repair_order_ids: [order.id] });
  if (draft.error) throw draft.error;
  const issued = await client.rpc('issue_invoice', { p_invoice_id: draft.data });
  if (issued.error) throw issued.error;
  const first = await client
    .from('payments')
    .insert({ invoice_id: draft.data, amount_ttc: 300, method: 'card' });
  if (first.error) throw first.error;
  const second = await client
    .from('payments')
    .insert({ invoice_id: draft.data, amount_ttc: 24, method: 'cash' });
  if (second.error) throw second.error;
  return draft.data;
}

test('réception sans bouton ; la direction annule, puis supprime un paiement avec motif, gardé dans l’historique', async ({
  page,
}, testInfo) => {
  test.slow();
  const id = suffix(testInfo);
  const invoiceId = await createPaidInvoice(`S${id}`, `Client suppression ${id}`);

  // Réception : le paiement se lit, la suppression n'est pas proposée
  await loginAs(page, 'reception@rts.local');
  await page.goto(`/factures/${invoiceId}`);
  const rows = page.getByRole('list', { name: 'Paiements' }).getByRole('listitem');
  await expect(rows).toHaveCount(2);
  await expect(page.getByText('La direction peut le supprimer')).toBeVisible();
  await expect(page.getByRole('button', { name: /Supprimer le paiement/ })).toHaveCount(0);
  const history = page.getByRole('list', { name: 'Historique des règlements' }).getByRole('listitem');
  await expect(history).toHaveCount(2);
  await expect(history.first()).toContainText(/Règlement enregistré :\s*300,00\s€/);
  await expect(history.first()).toContainText('par Réception');
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());

  // Direction : facture soldée, sans bouton d'encaissement
  await loginAs(page, 'direction@rts.local');
  await page.goto(`/factures/${invoiceId}`);
  const balance = page.getByLabel('Solde');
  await expect(balance).toContainText(/Reste dû\s*0,00\s€/);
  await expect(page.getByRole('button', { name: /Enregistrer un paiement/ })).toHaveCount(0);

  // Annuler : rien ne change
  const remove = page.getByRole('button', { name: /Supprimer le paiement de 24,00\s€ \(Espèces\)/ });
  await remove.click();
  const dialog = page.getByRole('dialog', { name: 'Supprimer ce paiement ?' });
  await expect(dialog).toContainText(/24,00\s€ · Espèces · payé le \d{2}\/\d{2}\/\d{4}/);
  await dialog.getByRole('button', { name: 'Annuler' }).click();
  await expect(dialog).toBeHidden();
  await expect(rows).toHaveCount(2);
  await expect(history).toHaveCount(2);
  await expect(balance).toContainText(/Reste dû\s*0,00\s€/);

  // Confirmer : le paiement part, le solde et l'état suivent, même après rechargement
  await remove.click();
  await dialog.getByLabel('Motif (facultatif)').fill('Erreur de mode de règlement');
  await dialog.getByRole('button', { name: 'Supprimer le paiement' }).click();
  await expect(dialog).toBeHidden();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Carte bancaire');
  await expect(balance).toContainText(/Reste dû\s*24,00\s€/);
  await expect(balance).toContainText(/Payé\s*300,00\s€/);
  await expect(page.getByRole('button', { name: /Enregistrer un paiement/ })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('list', { name: 'Paiements' }).getByRole('listitem')).toHaveCount(1);
  await expect(page.getByLabel('Solde')).toContainText(/Reste dû\s*24,00\s€/);

  // L'historique garde les deux saisies et la suppression
  await expect(history).toHaveCount(3);
  await expect(history.nth(2)).toContainText(/Règlement supprimé :\s*24,00\s€/);
  await expect(history.nth(2)).toContainText(/Supprimé le \d{2}\/\d{2}\/\d{4} à \d{2}:\d{2} par Direction/);
  await expect(history.nth(2)).toContainText('Motif : Erreur de mode de règlement');
});
