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

/** OR d'Alice facturé ce mois (API : réception). */
async function createInvoicedOrder(plate: string, clientName: string) {
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
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: clientName,
    p_requested_work: 'Freinage',
    p_technician_id: alice?.id,
  });
  if (error) throw error;
  const draft = await client.rpc('build_invoice_draft', { p_repair_order_ids: [order.id] });
  if (draft.error) throw draft.error;
  const lines = await client.from('invoice_lines').insert([
    {
      invoice_id: draft.data,
      repair_order_id: order.id,
      line_type: 'labor',
      description: 'Disques',
      unit_price: 270,
      quantity: 1,
      billed_hours: 3,
    },
    {
      invoice_id: draft.data,
      repair_order_id: order.id,
      line_type: 'part',
      description: 'Disque',
      unit_price: 200,
      quantity: 1,
      purchase_price: 120,
    },
  ]);
  if (lines.error) throw lines.error;
  const issued = await client.rpc('issue_invoice', { p_invoice_id: draft.data });
  if (issued.error) throw issued.error;
}

test('la direction consulte la rentabilité par client / véhicule et la performance', async ({
  page,
}, testInfo) => {
  test.slow();
  const id = suffix(testInfo);
  const plate = `RE${id}`;
  const clientName = `Client rentabilité ${id}`;
  await createInvoicedOrder(plate, clientName);

  await loginAs(page, 'direction@rts.local');
  await page.goto('/pilotage');
  await page.getByRole('link', { name: 'Rentabilité' }).click();
  await expect(page.getByRole('button', { name: 'Cette année' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Ce mois' }).click();
  await expect(page).toHaveURL(/periode=mois/);

  // CA 470 €, MO 270 €, pièces 200 €, marge 80 €, 3 h facturées, facture impayée (564 € TTC)
  const client = page.getByRole('button', { name: clientName });
  await expect(client.locator('xpath=ancestor::tr')).toContainText(
    /1\s*470\s€\s*270\s€\s*200\s€\s*80\s€\s*3 h\s*0 h\s*—\s*—\s*564\s€/,
  );
  await client.click();
  await page.getByRole('link', { name: plate }).click();
  await expect(page.getByRole('heading', { name: plate })).toBeVisible();

  await page.goto('/pilotage/performance');
  const alice = page.getByRole('article', { name: 'Alice' });
  await expect(alice).toContainText('/100');
  await expect(alice).toContainText(/OR facturés : [1-9]/);
});

test('la réception n’a pas accès à la rentabilité', async ({ page }) => {
  await loginAs(page, 'reception@rts.local');
  await page.goto('/pilotage/rentabilite');
  await expect(page.getByRole('heading', { name: 'Accès refusé' })).toBeVisible();
});
