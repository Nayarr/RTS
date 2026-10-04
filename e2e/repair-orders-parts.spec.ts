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

async function logout(page: Page) {
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page).toHaveURL(/\/connexion$/);
}

/** OR assigné à Alice, créé par la réception (API, comme l'écran bureau). */
async function createOrder(plate: string) {
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      auth: { persistSession: false },
    },
  );
  await client.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: alice } = await client.from('technicians').select('id').eq('display_name', 'Alice').single();
  const { data, error } = await client.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: 'Transports E2E',
    p_requested_work: 'Freinage',
    p_technician_id: alice?.id,
  });
  if (error) throw error;
  return data;
}

/** Carte de la fiche OR par son titre. */
const card = (page: Page, title: string) =>
  page.locator('[data-slot="card"]').filter({ has: page.getByRole('heading', { name: title, exact: true }) });

test('la réception suit pièces, sous-traitance et consommables ; le technicien voit l’état des pièces', async ({
  page,
}, testInfo) => {
  test.slow();
  const plate = `P${String(Date.now()).slice(-8)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;
  const order = await createOrder(plate);

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/or/${order.id}`);
  await expect(page.getByRole('link', { name: plate, exact: true })).toBeVisible();

  // Pièce reprise du catalogue, quantité 2
  const parts = card(page, 'Pièces');
  await parts.getByRole('button', { name: 'Ajouter une pièce' }).click();
  const partDialog = page.getByRole('dialog', { name: 'Ajouter une pièce' });
  await partDialog.getByRole('searchbox', { name: 'Chercher dans le catalogue' }).fill('filtre à huile');
  await partDialog.getByRole('button', { name: /Filtre à huile/ }).click();
  await expect(partDialog.getByLabel('Fournisseur')).toHaveValue('PL Pièces 95');
  await partDialog.getByLabel('Quantité').fill('2');
  await partDialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(parts.getByText(/Total pièces/)).toContainText('64,00 € HT');
  await expect(page.getByText('Attente pièces (1)')).toBeVisible();

  // Suivi de commande : reçue → plus d'attente, tracé dans l'historique
  const orderStatus = parts.getByRole('combobox', { name: 'Commande : Filtre à huile' });
  await orderStatus.selectOption('ordered');
  await expect(page.getByText('Filtre à huile : commandée')).toBeVisible();
  await orderStatus.selectOption('received');
  await expect(page.getByText('Attente pièces (1)')).toHaveCount(0);
  await expect(card(page, 'Historique').getByText('Pièce reçue : Filtre à huile')).toBeVisible();

  // Sous-traitance refacturée avec la marge
  const subcontracts = card(page, 'Sous-traitance');
  await subcontracts.getByRole('button', { name: 'Confier un travail à un prestataire' }).click();
  const subDialog = page.getByRole('dialog', { name: 'Sous-traitance' });
  await subDialog.getByLabel('Prestation').fill('Rectification disques');
  await subDialog.getByLabel('Prestataire').fill('Rectif Service');
  await subDialog.getByLabel('Coût HT (€)').fill('100');
  await subDialog.getByLabel('Marge (%)').fill('25');
  await expect(subDialog.getByText(/Refacturé :/)).toContainText('125,00 € HT');
  await subDialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(subcontracts.getByRole('button', { name: /Rectification disques/ })).toContainText(
    'refacturé 125,00 € HT',
  );
  await expect(subcontracts.getByText('Chez le prestataire')).toBeVisible();

  // Consommable ajouté puis retiré
  const consumables = card(page, 'Consommables (vrac)');
  await consumables.getByRole('button', { name: /Ajouter huile/ }).click();
  const useDialog = page.getByRole('dialog', { name: 'Consommable utilisé' });
  const adblue = await useDialog.getByRole('option', { name: /^AdBlue/ }).getAttribute('value');
  await useDialog.getByLabel('Produit').selectOption(adblue ?? '');
  await useDialog.getByLabel('Quantité').fill('12,5');
  await useDialog.getByRole('button', { name: 'Ajouter' }).click();
  await expect(consumables.getByText(/AdBlue · 12,5 L/)).toBeVisible();
  await consumables.getByRole('button', { name: 'Retirer AdBlue' }).click();
  await expect(consumables.getByText('Aucun consommable noté.')).toBeVisible();
  await logout(page);

  // Le technicien voit la pièce et son état, sans prix
  await loginAs(page, 'alice@rts.local');
  await page.goto(`/atelier/or/${order.id}`);
  const techParts = card(page, 'Pièces');
  await expect(techParts.getByText('Filtre à huile × 2')).toBeVisible();
  await expect(techParts.getByText('Reçue')).toBeVisible();
  await expect(techParts.getByText(/€/)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Sous-traitance' })).toHaveCount(0);
});
