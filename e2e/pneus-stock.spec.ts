import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';
import { sql } from './support/db';
import { goTo } from './support/nav';

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

test('entrée de pneus, seuil mini avec alerte, sortie avec motif, pneus réservés sur l’OR puis sortis à la facture', async ({
  page,
}, testInfo) => {
  test.slow();
  // Taille propre à chaque essai et à chaque navigateur (les tests tournent en parallèle)
  const width = 100 + (Date.now() % 900);
  const ratio = testInfo.project.name.includes('mobile') ? '55' : '60';
  const size = `${width}/${ratio} R22.5`;
  const label = `${size} arrière`;

  await loginAs(page, 'reception@rts.local');
  await goTo(page, 'Stock', 'Pneumatiques');
  await expect(page.getByRole('heading', { name: 'Pneumatiques' })).toBeVisible();

  // Entrée de 4 pneus, seuil mini 6 : la ligne est tout de suite à commander
  await page.getByRole('button', { name: 'Entrée de pneus' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Dimension').fill(`${width}${ratio}225`);
  await expect(dialog.getByLabel('Dimension')).toHaveValue(size);
  await dialog.getByLabel('Marque').fill('Michelin');
  await dialog.getByLabel('Modèle').fill('X Multi D');
  await dialog.getByRole('button', { name: 'Arrière' }).click();
  await dialog.getByLabel('Quantité').fill('4');
  await dialog.getByLabel('Stock mini').fill('6');
  await dialog.getByLabel('Prix d’achat HT (€)').fill('300');
  await dialog.getByLabel('Marge (%)').fill('30');
  await expect(dialog.getByLabel('Prix de vente HT (€)')).toHaveValue('390');
  await dialog.getByLabel('Fournisseur').fill('Euromaster');
  await dialog.getByRole('button', { name: 'Ajouter au stock' }).click();

  await expect(page.getByRole('heading', { name: new RegExp(`Michelin X Multi D · ${size}`) })).toBeVisible();
  const figures = page.getByRole('list', { name: 'Chiffres du pneu' });
  await expect(figures).toContainText('mini 6');
  await expect(figures).toContainText('390,00 €');
  await expect(page.getByText('Réception fournisseur Euromaster')).toBeVisible();
  const tireId = page.url().split('/').pop() ?? '';

  // Alerte de la direction et de la réception
  expect(sql(`select count(*) from public.notifications where title = 'Pneus à commander : ${label}'`)).toBe(
    '2',
  );

  // Stock : ligne « À commander », seuil ramené à 2 : OK
  await page.getByRole('link', { name: 'Retour au stock des pneus' }).click();
  await page.getByRole('searchbox', { name: 'Rechercher une taille' }).fill(`${width}${ratio}`);
  const row = page.getByRole('row', { name: label });
  await expect(row.getByText('À commander')).toBeVisible();
  await expect(row.getByText('Michelin 4')).toBeVisible();
  const min = row.getByLabel(`Seuil mini ${label}`);
  await min.fill('2');
  await min.press('Enter');
  await expect(row.getByText('OK', { exact: true })).toBeVisible();

  // Sortie d'un pneu abîmé : motif obligatoire
  await page.goto(`/stock/pneumatiques/${tireId}`);
  await page.getByRole('button', { name: 'Sortie / correction' }).click();
  const correction = page.getByRole('dialog');
  await correction.getByLabel('Pneus sortis').fill('1');
  await correction.getByRole('button', { name: 'Valider' }).click();
  await expect(correction.getByText('Indique le motif')).toBeVisible();
  await correction.getByLabel('Motif').fill('Pneu abîmé au stockage');
  await correction.getByRole('button', { name: 'Valider' }).click();
  await expect(page.getByText('Sortie de stock')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Chiffres du pneu' })).toContainText('3');

  // Deux pneus posés sur un OR : réservés, puis sortis du stock à l'émission de la facture
  const reception = await api('reception@rts.local');
  const { data: lot } = await reception.from('tires').select('part_id').eq('id', tireId).single();
  const plate = `ST${String(Date.now()).slice(-6)}${ratio}`;
  const { data: order, error } = await reception.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: 'Transports E2E',
    p_requested_work: 'Pneus arrière',
  });
  if (error) throw error;
  const tires = await reception.from('ro_lines').insert({
    repair_order_id: order.id,
    kind: 'planned',
    line_type: 'part',
    description: `Pneu Michelin X Multi D ${size}`,
    quantity: 2,
    unit_price: 390,
    purchase_price: 300,
    part_id: lot?.part_id ?? null,
    order_status: 'received',
  });
  if (tires.error) throw tires.error;
  await page.reload();
  await expect(page.getByRole('list', { name: 'Chiffres du pneu' })).toContainText('2 réservés');

  const draft = await reception.rpc('build_invoice_draft', { p_repair_order_ids: [order.id] });
  if (draft.error) throw draft.error;
  const issued = await reception.rpc('issue_invoice', { p_invoice_id: draft.data });
  if (issued.error) throw issued.error;
  await page.reload();
  await expect(
    page.getByRole('link', { name: new RegExp(`Posés sur ${order.number} · ${plate}`) }),
  ).toBeVisible();
  await expect(page.getByRole('list', { name: 'Chiffres du pneu' })).not.toContainText('réservés');
  expect(sql(`select stock_qty from public.tires where id = '${tireId}'`)).toBe('1');
});
