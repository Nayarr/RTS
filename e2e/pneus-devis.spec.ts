import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';
import { sql } from './support/db';

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

test('devis : pneus du stock pour la taille relevée sur la fiche de contrôle, pneus réservés', async ({
  page,
}, testInfo) => {
  test.slow();
  const mobile = testInfo.project.name.includes('mobile');
  const width = 100 + (Date.now() % 900);
  const ratio = mobile ? '35' : '40';
  const size = `${width}/${ratio} R22.5`;
  const plate = `PD${String(Date.now()).slice(-6)}${mobile ? 'M' : 'D'}`;
  const reception = await api('reception@rts.local');

  // Stock de la taille : un lot avant bien fourni, un lot arrière d'un seul pneu
  const add = (profile: 'avant' | 'arriere', model: string, quantity: number, price: number) =>
    reception.rpc('add_tires', {
      p_category: 'pl',
      p_size: `${width}${ratio}225`,
      p_profile: profile,
      p_brand: 'Michelin',
      p_model: model,
      p_condition: 'neuf',
      p_quantity: quantity,
      p_purchase_price: price - 100,
      p_sale_price: price,
    });
  const front = await add('avant', 'X Multi Z', 8, 415);
  if (front.error) throw front.error;
  const rear = await add('arriere', 'X Multi D', 1, 436);
  if (rear.error) throw rear.error;

  // OR dont la fiche relève les pneus avant HS dans cette taille, devis préparé
  const { data: order, error } = await reception.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: 'Transports E2E',
    p_requested_work: 'Contrôle pneus',
  });
  if (error) throw error;
  sql(
    `insert into public.inspections (repair_order_id, data) values ('${order.id}', '{"pneus": {"avant_etat": "HS", "avant_taille": "${width}/${ratio}/22.5"}}')`,
  );
  const quote = await reception.rpc('build_quote_from_repair_order', { p_repair_order_id: order.id });
  if (quote.error) throw quote.error;

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/devis/${quote.data}`);
  await page.getByRole('button', { name: 'Pneus du stock' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: `Pneus avant (HS) · ${size}` })).toBeVisible();
  await expect(dialog.getByRole('radio', { name: 'Michelin X Multi Z' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(dialog.getByText('Stock insuffisant pour 2 pneus')).toBeVisible();
  await expect(dialog).toContainText('2 × 415,00 € = 830,00 € HT');
  await dialog.getByRole('button', { name: 'Ajouter au devis' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: `Supprimer Pneu Michelin X Multi Z ${size}` })).toBeVisible();

  // Pneus réservés pour ce devis : le disponible baisse, le stock reste
  expect(
    sql(`select stock_qty || '/' || reserved_qty from public.v_tire_lots where id = '${front.data}'`),
  ).toBe('8/2');
});
