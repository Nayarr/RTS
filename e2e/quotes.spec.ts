import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';
import { goTo } from './support/nav';
import { fillNewProClient } from './support/new-client';

const env = loadEnv('production', process.cwd(), 'VITE_');
const PASSWORD = 'atelier-dev-2026';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
}

const uniquePlate = (prefix: string, project: string) =>
  `${prefix}${String(Date.now()).slice(-8)}${project.includes('mobile') ? 'M' : 'D'}`;

/** OR avec un travail à prévoir signalé par l'atelier (API, comme le ferait le technicien). */
async function createOrderWithPlannedWork(plate: string) {
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
    p_client_name: 'Transports E2E',
    p_requested_work: 'Bruit au freinage',
  });
  if (error) throw error;
  // Mission de l'OR (déjà dans les travaux effectués) remplacée par les travaux du test
  await client.from('ro_lines').delete().eq('repair_order_id', order.id).eq('kind', 'done');
  const inserted = await client.from('ro_lines').insert({
    repair_order_id: order.id,
    kind: 'planned',
    line_type: 'labor',
    description: 'Remplacement disques avant',
    estimated_hours: 3,
  });
  if (inserted.error) throw inserted.error;
  return order;
}

test('devis d’un OR : chiffrage, pièce, PDF, accord du client, OR des travaux acceptés', async ({
  page,
}, testInfo) => {
  test.slow();
  const plate = uniquePlate('Q', testInfo.project.name);
  const order = await createOrderWithPlannedWork(plate);

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/or/${order.id}`);
  await page.getByRole('button', { name: 'Préparer le devis' }).first().click();
  await expect(page.getByRole('heading', { name: 'DEVIS', exact: true, level: 2 })).toBeVisible();

  // Travail de l'OR chiffré au taux PL (3 h × 90 €)
  const totals = page.getByLabel('Totaux');
  await expect(page.getByRole('textbox', { name: 'Désignation' }).first()).toHaveValue(
    'Remplacement disques avant',
  );
  await expect(totals).toContainText('270,00 €');

  // Pièce proposée par la base pendant la saisie
  await page.getByRole('button', { name: 'Ajouter une pièce' }).click();
  const partDialog = page.getByRole('dialog', { name: 'Ajouter une pièce' });
  await partDialog.getByLabel('Désignation').fill('filtre à huile');
  await partDialog
    .getByRole('list', { name: 'Pièces de la base' })
    .getByRole('button', { name: /Filtre à huile/ })
    .click();
  await partDialog.getByRole('button', { name: 'Ajouter la pièce' }).click();
  await expect(totals).toContainText('302,00 €');
  await expect(totals).toContainText('362,40 €');

  // Remise saisie sur la main d'œuvre
  await page.getByRole('textbox', { name: 'Remise %' }).first().fill('10');
  await page.getByRole('textbox', { name: 'Remise %' }).first().blur();
  await expect(totals).toContainText('275,00 €');

  // PDF : le numéro est attribué à la première génération
  await page.getByRole('button', { name: 'Générer le PDF' }).click();
  const preview = page.getByRole('dialog', { name: 'Aperçu' });
  await expect(preview.getByText(/^Devis_DV\d{5}_/)).toBeVisible();
  await preview.getByRole('button', { name: 'Fermer' }).click();
  await expect(page.getByText(/^DV\d{5}$/).first()).toBeVisible();

  // Accord du client : devis figé
  await page.getByRole('button', { name: 'Accepté', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer l’accord' }).click();
  await expect(page.getByText('Devis accepté par le client : il ne peut plus être modifié.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Prix unit. HT' }).first()).toBeDisabled();

  // Nouvel OR avec les travaux acceptés, pour Alice
  await page.getByRole('button', { name: 'Créer l’OR avec les travaux acceptés' }).click();
  const create = page.getByRole('dialog', { name: 'Créer l’OR' });
  await create.getByLabel('Technicien').selectOption({ label: 'Alice' });
  await create.getByRole('button', { name: 'Créer l’OR' }).click();
  await expect(page.getByRole('link', { name: plate, exact: true })).toBeVisible();
  await expect(page.getByText('Attente pièces (1)')).toBeVisible();
  await expect(page.getByText(/Technicien : Alice/)).toBeVisible();

  // L'OR d'origine garde la trace de l'accord
  await page.goto(`/or/${order.id}`);
  await expect(page.getByText(/Devis DV\d{5} accepté par le client/)).toBeVisible();
});

test('devis sans OR : demande de prix, refus puis réouverture, transformation en OR', async ({
  page,
}, testInfo) => {
  const plate = uniquePlate('S', testInfo.project.name);
  await loginAs(page, 'reception@rts.local');
  await goTo(page, 'Facturation', 'Devis');
  await page.getByRole('link', { name: 'Nouveau devis' }).click();
  await page.getByLabel('Client', { exact: true }).fill(`Client ${plate}`);
  await fillNewProClient(page);
  await page.getByLabel('Immatriculation (facultatif)').fill(plate);
  await page.getByRole('button', { name: 'Créer le devis' }).click();
  await expect(page.getByRole('heading', { name: 'DEVIS', exact: true, level: 2 })).toBeVisible();

  await page.getByRole('button', { name: 'Ajouter de la main d’œuvre' }).click();
  const labor = page.getByRole('dialog', { name: 'Main d’œuvre' });
  await labor.getByLabel('Prestation').fill('Diagnostic électronique');
  await labor.getByLabel('Temps (heures)').fill('1,5');
  await labor.getByRole('button', { name: 'Ajouter' }).click();
  // Heure entamée, heure facturée : 1,5 h → 2 h (2 × 90 €)
  await expect(page.getByLabel('Totaux')).toContainText('180,00 €');

  await page.getByRole('button', { name: 'Refusé', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer le refus' }).click();
  await expect(page.getByText('Refusé', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Rouvrir le devis' }).click();
  await expect(page.getByRole('button', { name: 'Accepté', exact: true })).toBeVisible();

  // Retrouvé dans la liste
  await page.goto('/devis');
  await page.getByRole('searchbox', { name: 'Rechercher un devis' }).fill(plate);
  await expect(page.getByText(new RegExp(`Client ${plate}`))).toBeVisible();
  await page.getByText(new RegExp(`Client ${plate}`)).click();

  await page.getByRole('button', { name: 'Transformer en OR' }).click();
  await page.getByRole('dialog', { name: 'Créer l’OR' }).getByRole('button', { name: 'Créer l’OR' }).click();
  await expect(page.getByRole('link', { name: plate, exact: true })).toBeVisible();
  await expect(page.getByText('Diagnostic électronique').first()).toBeVisible();
});
