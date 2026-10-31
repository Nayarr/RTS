import { readFileSync } from 'node:fs';
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

/** OR terminé avec 3 h de main d'œuvre (API, comme l'atelier). */
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
  });
  if (error) throw error;
  await client.from('ro_lines').delete().eq('repair_order_id', order.id).eq('kind', 'done');
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

test('facture pro forma : quantité de main d’œuvre sans l’unité « h », prix et total inchangés', async ({
  page,
}, testInfo) => {
  const id = `${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-7)}`;
  const order = await createFinishedOrder(`P${id}`, `Client pro forma ${id}`);

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/or/${order.id}`);
  await page.getByRole('button', { name: 'Facturer', exact: true }).click();
  await expect(page.getByLabel('Totaux')).toContainText('270,00 €');

  await page.getByRole('button', { name: 'Aperçu pro forma' }).click();
  const preview = page.getByRole('dialog', { name: 'Aperçu' });
  await expect(preview.getByText(/^Proforma_/)).toBeVisible();
  const download = page.waitForEvent('download');
  await preview.getByRole('link', { name: 'Télécharger' }).click();
  // Textes du PDF (polices standard, non compressés) : « 3 » et non « 3 h », taux horaire gardé
  const pdf = readFileSync(await (await download).path()).toString('latin1');
  expect(pdf).toContain('(Remplacement disques avant)');
  expect(pdf).not.toContain('(3 h)');
  expect(pdf).toContain('(3)');
  expect(pdf).toContain('(90,00');
  expect(pdf.match(/\(270,00 /g)?.length).toBeGreaterThanOrEqual(2);
});
