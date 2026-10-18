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

/** Changement de compte : session de l'appareil effacée. */
async function logout(page: Page) {
  await page.evaluate(() => localStorage.clear());
  await page.context().clearCookies();
}

async function api(email: string) {
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      auth: { persistSession: false },
    },
  );
  await client.auth.signInWithPassword({ email, password: PASSWORD });
  return client;
}

const choose = (page: Page, group: string, value: string) =>
  page.getByRole('radiogroup', { name: group }).getByRole('radio', { name: value }).click();

test('pneus avant HS et arrière à 50 % : « Remplacement Pneus » pour le technicien, forfaits au devis seulement', async ({
  page,
}, testInfo) => {
  test.slow();
  const plate = `PN${String(Date.now()).slice(-6)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;
  const reception = await api('reception@rts.local');
  const { data: alice } = await reception
    .from('technicians')
    .select('id')
    .eq('display_name', 'Alice')
    .single();
  const { data: order, error } = await reception.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: 'Transports E2E',
    p_requested_work: 'Contrôle pneus',
    p_technician_id: alice?.id,
  });
  if (error) throw error;

  // Technicien : pneus avant HS, arrière à 50 % ; il ne voit que ses deux lignes
  await loginAs(page, 'alice@rts.local');
  await page.goto(`/atelier/or/${order.id}`);
  await choose(page, 'Pneus avant', 'HS');
  await choose(page, 'Pneus arrière', '50%');
  const planned = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole('heading', { name: 'Pièces / réparations à prévoir (devis)' }) });
  const tasks = planned.getByRole('textbox', { name: 'Description de la tâche' });
  await expect(tasks).toHaveCount(2);
  await expect(tasks.nth(0)).toHaveValue('Remplacement Pneus avant');
  await expect(tasks.nth(1)).toHaveValue('Remplacement Pneus arrière');
  await expect(page.getByText(/DÉPOSE\/REPOSE|RECYCLAGE|ÉQUILIBRAGE/)).toHaveCount(0);
  await logout(page);

  // Bureau : sur l'OR, les forfaits sont marqués « devis et facture seulement »
  await loginAs(page, 'reception@rts.local');
  await page.goto(`/or/${order.id}`);
  await expect(page.getByText('DÉPOSE/REPOSE ROUE X4 (arrière)')).toBeVisible();
  await expect(page.getByText('Devis et facture seulement').first()).toBeVisible();

  // Devis préparé depuis l'OR : forfaits au barème PL, sans les lignes du technicien
  const { data: quoteId, error: quoteError } = await reception.rpc('build_quote_from_repair_order', {
    p_repair_order_id: order.id,
  });
  if (quoteError) throw quoteError;
  const { data: lines } = await reception
    .from('quote_lines')
    .select('description, unit_price')
    .eq('quote_id', quoteId)
    .neq('line_type', 'text');
  expect(
    (lines ?? []).map((line) => [line.description.split('\n')[0], Number(line.unit_price)]).sort(),
  ).toEqual([
    ['DÉPOSE/REPOSE PNEUMATIQUE X2 (avant)', 36],
    ['DÉPOSE/REPOSE PNEUMATIQUE X4 (arrière)', 72],
    ['DÉPOSE/REPOSE ROUE X2 (avant)', 36],
    ['DÉPOSE/REPOSE ROUE X4 (arrière)', 72],
    ['RECYCLAGE PNEUMATIQUE X2 (avant)', 16],
    ['RECYCLAGE PNEUMATIQUE X4 (arrière)', 32],
    ['ÉQUILIBRAGE X2 (avant)', 70],
  ]);
  await page.goto(`/devis/${quoteId}`);
  await expect(page.getByText('RECYCLAGE PNEUMATIQUE X4 (arrière)').first()).toBeVisible();
  await expect(page.getByText('Remplacement Pneus avant')).toHaveCount(0);
});

test('forfaits des pneus dans Stock › Forfaits : prix, barème et « devis et facture seulement » modifiables', async ({
  page,
}) => {
  await loginAs(page, 'direction@rts.local');
  await page.goto('/stock/forfaits');
  await page.getByRole('group', { name: 'Type de véhicule' }).getByRole('button', { name: 'PL' }).click();
  const card = page.getByRole('article', { name: 'DÉPOSE/REPOSE ROUE X4' });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Modifier DÉPOSE/REPOSE ROUE X4' }).click();
  const dialog = page.getByRole('dialog');
  // Barème de l'arrière d'un poids lourd : 1 h (30 min à l'avant), modifiable
  await expect(dialog.getByLabel('Temps barème (heures)')).toHaveValue(/^1([,.]0+)?$/);
  await expect(dialog.getByLabel('Temps barème (heures)')).toBeEditable();
  await expect(dialog.getByLabel('Prix forfaitaire HT (€)')).toHaveValue(/^72([,.]00?)?$/);
  await expect(dialog.getByLabel('Pneus arrière')).toBeChecked();
  await expect(dialog.getByLabel('Devis et facture seulement')).toBeChecked();
  await page.keyboard.press('Escape');
});
