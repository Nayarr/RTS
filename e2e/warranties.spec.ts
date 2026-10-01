import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
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

const suffix = (testInfo: TestInfo) =>
  `${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-7)}`;

/** OR avec une pièce (API : réception). */
async function createOrderWithPart(plate: string, partName: string) {
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
    p_requested_work: 'Freinage',
  });
  if (error) throw error;
  const supplier = await client.rpc('ensure_supplier', { p_name: 'PL Pièces 95' });
  if (supplier.error) throw supplier.error;
  const part = await client.from('ro_lines').insert({
    repair_order_id: order.id,
    kind: 'done',
    line_type: 'part',
    description: partName,
    quantity: 1,
    unit_price: 260,
    purchase_price: 180,
    brand: 'Knorr-Bremse',
    manufacturer_ref: 'K012345',
    supplier_id: supplier.data,
    order_status: 'received',
  });
  if (part.error) throw part.error;
  return order;
}

test('retour d’une pièce d’OR au fournisseur, suivi jusqu’au remboursement', async ({ page }, testInfo) => {
  test.slow();
  const id = suffix(testInfo);
  const plate = `GA${id}`;
  const partName = `Étrier de frein ${id}`;
  const order = await createOrderWithPart(plate, partName);

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/or/${order.id}`);
  await page.getByRole('button', { name: `Déclarer un retour : ${partName}` }).click();
  const dialog = page.getByRole('dialog', { name: 'Nouveau retour / garantie' });
  await expect(dialog.getByLabel('Fournisseur')).toHaveValue('PL Pièces 95');
  await expect(dialog.getByLabel('Référence')).toHaveValue('K012345');
  await expect(dialog.getByLabel('Montant HT (€)')).toHaveValue('180');
  await dialog.getByLabel('Motif du retour').fill('Fuite');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(`Retour / garantie déclaré : ${partName}`)).toBeVisible();

  // Liste des retours en cours, rattaché à l'OR et au véhicule
  await page.getByRole('link', { name: 'Garanties' }).click();
  const card = page.getByRole('row', { name: new RegExp(partName) });
  await expect(card).toContainText('À retourner');
  await expect(card).toContainText('Knorr-Bremse — PL Pièces 95 — K012345 — 180,00 € HT');
  await expect(card.getByRole('link', { name: plate })).toBeVisible();

  // Envoyé, puis remboursé : il quitte les retours en cours
  await card.getByRole('button', { name: partName, exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Retour / garantie' });
  await edit.getByLabel('Statut').selectOption({ label: 'Remboursée / échangée' });
  await edit.getByLabel(/Notes/).fill(`RMA ${id}`);
  await edit.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(edit).toBeHidden();
  await expect(card).toHaveCount(0);
  await page.getByRole('button', { name: 'Remboursée / échangée' }).click();
  await expect(card).toContainText(`RMA ${id}`);

  // Suppression
  await card.getByRole('button', { name: `Supprimer ${partName}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.getByText('Retour supprimé')).toBeVisible();
  await expect(card).toHaveCount(0);
});

test('un technicien n’a pas accès aux garanties', async ({ page }) => {
  await loginAs(page, 'alice@rts.local');
  await page.goto('/garanties');
  await expect(page.getByRole('heading', { name: 'Accès refusé' })).toBeVisible();
});
