import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';

const env = loadEnv('production', process.cwd(), 'VITE_');
const PASSWORD = 'atelier-dev-2026';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
}

const suffix = (project: string) =>
  `${project.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-7)}`;

/** OR terminé avec 3 h de main d'œuvre déclarées (API, comme l'atelier). */
async function createFinishedOrder(plate: string, clientName: string) {
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
    p_mileage: 184320,
  });
  if (error) throw error;
  const work = await client.from('ro_lines').insert({
    repair_order_id: order.id,
    kind: 'done',
    line_type: 'labor',
    description: 'Remplacement disques avant',
    estimated_hours: 3,
  });
  if (work.error) throw work.error;
  const status = await client.from('repair_orders').update({ status: 'to_invoice' }).eq('id', order.id);
  if (status.error) throw status.error;
  return order;
}

test('facture d’un OR : brouillon, coordonnées, émission, PDF, paiement, avoir', async ({
  page,
}, testInfo) => {
  test.slow();
  const id = suffix(testInfo.project.name);
  const plate = `F${id}`;
  const clientName = `Client facture ${id}`;
  const order = await createFinishedOrder(plate, clientName);

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/or/${order.id}`);
  await expect(page.getByText('OR validé : la facture est à faire.')).toBeVisible();
  await page.getByRole('button', { name: 'Facturer', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'FACTURE', exact: true })).toBeVisible();
  await expect(page.getByText('Brouillon — numéro attribué à l’émission')).toBeVisible();

  // Main d'œuvre reprise de l'OR, au taux PL
  const totals = page.getByLabel('Totaux');
  await expect(totals).toContainText('270,00 €');
  await page.getByRole('button', { name: 'Insérer une ligne de texte' }).click();
  await page.getByRole('textbox', { name: 'Désignation' }).last().fill('Contrôle freinage OK');
  await page.getByRole('textbox', { name: 'Désignation' }).last().blur();

  // Coordonnées manquantes signalées, puis complétées
  await page.getByRole('button', { name: 'Émettre la facture' }).click();
  let confirm = page.getByRole('dialog', { name: 'Émettre définitivement cette facture ?' });
  await expect(confirm).toContainText('adresse du client manquante, SIREN du client manquant');
  await confirm.getByRole('button', { name: 'Annuler' }).click();
  await page.getByLabel('Adresse de facturation').fill('1 rue du Test\n95190 Goussainville');
  await page.getByLabel('SIREN').fill('123 456 789');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByText('Coordonnées du client enregistrées')).toBeVisible();

  await page.getByRole('button', { name: 'Émettre la facture' }).click();
  confirm = page.getByRole('dialog', { name: 'Émettre définitivement cette facture ?' });
  await expect(confirm).not.toContainText('Attention');
  await confirm.getByRole('button', { name: 'Émettre la facture' }).click();
  await expect(page.getByText(/^F\d+$/)).toBeVisible();
  await expect(page.getByText(/Facture émise : elle ne se modifie plus/)).toBeVisible();
  await expect(page.getByText('1 rue du Test')).toBeVisible();

  // PDF
  await page.getByRole('button', { name: 'PDF de la facture' }).click();
  const preview = page.getByRole('dialog', { name: 'Aperçu' });
  await expect(preview.getByText(/^Facture_F\d+_F/)).toBeVisible();
  await preview.getByRole('button', { name: 'Fermer' }).click();

  // Paiement partiel puis avoir
  await page.getByRole('button', { name: 'Enregistrer un paiement' }).click();
  const payment = page.getByRole('dialog', { name: 'Paiement' });
  await expect(payment.getByLabel('Montant TTC (€)')).toHaveValue('324');
  await payment.getByLabel('Montant TTC (€)').fill('200');
  await payment.getByLabel('Mode').selectOption({ label: 'Chèque' });
  await payment.getByRole('button', { name: 'Enregistrer le paiement' }).click();
  const balance = page.getByLabel('Solde');
  await expect(balance).toContainText('124,00 €');

  await page.getByRole('button', { name: 'Générer un avoir' }).click();
  const credit = page.getByRole('dialog', { name: 'Générer un avoir' });
  await credit.getByLabel('Montant HT à créditer (€)').fill('20');
  await credit.getByLabel('Motif').fill('Geste commercial');
  await credit.getByRole('button', { name: 'Générer l’avoir' }).click();
  await expect(page.getByRole('dialog', { name: 'Aperçu' }).getByText(/^Avoir_AV\d+_F/)).toBeVisible();
  await page.getByRole('dialog', { name: 'Aperçu' }).getByRole('button', { name: 'Fermer' }).click();
  await expect(balance).toContainText('100,00 €');

  // L'OR est facturé ; la facture est dans la liste « À encaisser »
  await page.goto(`/or/${order.id}`);
  await expect(page.getByText('Facturé', { exact: true }).first()).toBeVisible();
  await page.goto('/factures');
  await page.getByRole('searchbox', { name: 'Rechercher une facture' }).fill(plate);
  await expect(page.getByText('Partiellement payée')).toBeVisible();
});

test('facture groupée : deux OR du même client sur un brouillon', async ({ page }, testInfo) => {
  const id = suffix(testInfo.project.name);
  const clientName = `Client groupé ${id}`;
  const first = await createFinishedOrder(`G${id}A`, clientName);
  const second = await createFinishedOrder(`G${id}B`, clientName);

  await loginAs(page, 'reception@rts.local');
  await page.getByRole('link', { name: 'Facturation' }).click();
  await page.getByRole('button', { name: 'Facture groupée' }).click();
  const dialog = page.getByRole('dialog', { name: 'Facture groupée' });
  await dialog.getByLabel('Client').selectOption({ label: `${clientName} (2 OR)` });
  await expect(dialog.getByRole('checkbox')).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Préparer la facture groupée' }).click();

  await expect(page.getByText('Plusieurs véhicules (2)')).toBeVisible();
  await expect(page.getByRole('link', { name: first.number })).toBeVisible();
  await expect(page.getByRole('link', { name: second.number })).toBeVisible();
  await expect(page.getByLabel('Totaux')).toContainText('540,00 €');

  await page.getByRole('button', { name: 'Supprimer le brouillon' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click();
  await expect(page).toHaveURL(/\/factures$/);
});
