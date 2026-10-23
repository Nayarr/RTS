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

/** Facture émise de 324 € TTC (3 h à 90 € HT) pour un nouveau client (API : réception). */
async function createIssuedInvoice(plate: string, clientName: string) {
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      auth: { persistSession: false },
    },
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
  return { id: draft.data, number: issued.data, clientId: order.client_id ?? '' };
}

test('client en prélèvement, facture payée en deux fois, rangée dans « Partiel », échéance déplacée', async ({
  page,
}, testInfo) => {
  test.slow();
  const id = suffix(testInfo);
  const clientName = `Client paiements ${id}`;
  const invoice = await createIssuedInvoice(`P${id}`, clientName);

  await loginAs(page, 'reception@rts.local');

  // Type de compte sur la fiche du client
  await page.goto(`/clients/${invoice.clientId}`);
  await page.getByLabel('Type de compte').selectOption('prelevement');
  await page.getByRole('button', { name: 'Enregistrer' }).first().click();
  await expect(page.getByText('Prélèvement', { exact: true }).first()).toBeVisible();

  // Premier paiement : 50 € en carte (le mode proposé est le prélèvement)
  await page.goto(`/factures/${invoice.id}`);
  await page.getByRole('button', { name: /Enregistrer un paiement/ }).click();
  let dialog = page.getByRole('dialog', { name: 'Paiement' });
  await expect(dialog.getByLabel('Mode')).toHaveValue('direct_debit');
  await dialog.getByLabel('Montant TTC (€)').fill('50');
  await expect(dialog.getByRole('status')).toContainText('il restera');
  await dialog.getByLabel('Mode').selectOption('card');
  await dialog.getByRole('button', { name: 'Enregistrer le paiement' }).click();
  await expect(dialog).toBeHidden();

  // Deuxième paiement : 20 € en espèces
  await page.getByRole('button', { name: /Enregistrer un paiement/ }).click();
  dialog = page.getByRole('dialog', { name: 'Paiement' });
  await dialog.getByLabel('Montant TTC (€)').fill('20');
  await dialog.getByLabel('Mode').selectOption('cash');
  await dialog.getByRole('button', { name: 'Enregistrer le paiement' }).click();
  await expect(dialog).toBeHidden();

  const payments = page.getByRole('list', { name: 'Paiements' }).getByRole('listitem');
  await expect(payments).toHaveCount(2);
  await expect(payments.first()).toContainText('Carte bancaire');
  await expect(payments.first()).toContainText(
    /Enregistré le \d{2}\/\d{2}\/\d{4} à \d{2}:\d{2} par Réception/,
  );
  await expect(payments.nth(1)).toContainText('Espèces');
  await expect(page.getByLabel('Solde')).toContainText(/Reste dû\s*254,00\s€/);

  // Échéance déplacée de 15 jours
  await page.getByRole('button', { name: /Modifier l’échéance/ }).click();
  dialog = page.getByRole('dialog', { name: 'Échéance' });
  const current = await dialog.getByLabel('Nouvelle échéance').inputValue();
  const later = new Date(`${current}T12:00:00Z`);
  later.setUTCDate(later.getUTCDate() + 15);
  await dialog.getByLabel('Nouvelle échéance').fill(later.toISOString().slice(0, 10));
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('list', { name: 'Échéances déplacées' })).toContainText('reportée au');

  // Liste des factures : « Partiel »
  await page.goto('/factures');
  await page.getByRole('button', { name: /^Partiel/ }).click();
  await page.getByRole('searchbox', { name: 'Rechercher une facture' }).fill(invoice.number);
  await expect(page.getByText(clientName).first()).toBeVisible();
});
