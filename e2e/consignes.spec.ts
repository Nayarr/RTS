import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
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

/** OR assigné à Alice par la réception, avec une pièce chez un fournisseur propre au test. */
async function orderWithPart(id: string) {
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      auth: { persistSession: false },
    },
  );
  await client.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: alice } = await client.from('technicians').select('id').eq('display_name', 'Alice').single();
  const { data: order, error } = await client.rpc('create_repair_order', {
    p_plate: `CS${id}`,
    p_vehicle_type: 'pl',
    p_client_name: 'Transports E2E',
    p_requested_work: 'Alternateur HS',
    p_technician_id: alice?.id,
  });
  if (error) throw error;
  const supplier = await client
    .from('suppliers')
    .insert({ name: `Fournisseur ${id}` })
    .select('id')
    .single();
  if (supplier.error) throw supplier.error;
  const line = await client.from('ro_lines').insert({
    repair_order_id: order.id,
    kind: 'done',
    line_type: 'part',
    description: `Alternateur ${id}`,
    unit_price: 420,
    supplier_id: supplier.data.id,
    order_status: 'received',
  });
  if (line.error) throw line.error;
  return order;
}

test('consigne : le mécano garde l’ancienne pièce, le bureau la renvoie puis note le remboursement', async ({
  page,
}, testInfo) => {
  const id = `${String(Date.now()).slice(-7)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;
  const order = await orderWithPart(id);

  // Mécano : case cochée sur la pièce
  await loginAs(page, 'alice@rts.local');
  await page.goto(`/atelier/or/${order.id}`);
  const parts = page.getByRole('region', { name: 'Pièces' });
  await parts.getByRole('checkbox', { name: 'Ancienne pièce en consigne' }).click();
  await expect(parts.getByText('Garder l’ancienne pièce (consigne)')).toBeVisible();
  // Bureau dans une autre session
  await page.evaluate(() => localStorage.clear());
  await page.context().clearCookies();

  // Bureau : badge sur la fiche OR, montant saisi
  await loginAs(page, 'reception@rts.local');
  await page.goto(`/or/${order.id}`);
  await page.getByRole('button', { name: `Consigne de Alternateur ${id} : À renvoyer` }).click();
  let dialog = page.getByRole('dialog', { name: `Consigne · Alternateur ${id}` });
  await dialog.getByLabel('Consigne HT (€)').fill('120');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(
    page.getByRole('button', { name: `Consigne de Alternateur ${id} : À renvoyer` }),
  ).toContainText('120,00');

  // Page Consignes : groupée sous le fournisseur, renvoi groupé
  await page.goto('/consignes');
  const group = page.getByRole('region', { name: `Fournisseur ${id}` });
  await expect(group.getByText(`Alternateur ${id}`)).toBeVisible();
  await group.getByRole('checkbox', { name: `Sélectionner Alternateur ${id}` }).click();
  await page.getByRole('button', { name: 'Marquer renvoyées' }).click();
  await expect(group.getByText('Renvoyée', { exact: true })).toBeVisible();

  // Remboursement : avoir de 100 €
  await group.getByRole('button', { name: `Suivre la consigne de Alternateur ${id}` }).click();
  dialog = page.getByRole('dialog', { name: `Consigne · Alternateur ${id}` });
  await dialog.getByLabel('Statut').selectOption('refunded');
  await dialog.getByLabel('Avoir reçu HT (€)').fill('100');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(group).toBeHidden();
  await page.getByRole('button', { name: /Remboursée/ }).click();
  await expect(
    page.getByRole('region', { name: `Fournisseur ${id}` }).getByText('avoir 100,00 €'),
  ).toBeVisible();

  // Historique de l'OR
  await page.goto(`/or/${order.id}`);
  await expect(page.getByText(`Consigne remboursée : Alternateur ${id}`)).toBeVisible();
});
