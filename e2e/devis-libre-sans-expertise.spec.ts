import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
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

const uniquePlate = (testInfo: TestInfo) =>
  `DL${String(Date.now()).slice(-6)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;

test('devis libre transformé en OR puis accepté : pas de travaux « réalisés avant le devis »', async ({
  page,
}, testInfo) => {
  test.slow();
  const plate = uniquePlate(testInfo);
  const api = createClient<Database>(env.VITE_SUPABASE_URL ?? '', env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '', {
    auth: { persistSession: false },
  });
  await api.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  // Devis fait librement, sans OR
  const { data: quote, error } = await api.rpc('create_quote', {
    p_client_name: `Client devis libre ${plate}`,
    p_plate: plate,
    p_vehicle_type: 'pl',
  });
  if (error) throw error;
  const added = await api.from('quote_lines').insert([
    {
      quote_id: quote.id,
      position: 0,
      line_type: 'labor',
      description: 'Remplacement turbocompresseur',
      estimated_hours: 6,
      unit_price: 90,
      quantity: 6,
    },
    {
      quote_id: quote.id,
      position: 1,
      line_type: 'labor',
      description: 'Remplacement joint spi boite de vitesse',
      estimated_hours: 1,
      unit_price: 90,
      quantity: 1,
    },
  ]);
  if (added.error) throw added.error;
  // OR créé depuis le devis, puis devis envoyé au client
  const order = await api.rpc('create_repair_order_from_quote', { p_quote_id: quote.id });
  if (order.error) throw order.error;
  const shared = await api.rpc('share_quote', { p_quote_id: quote.id });
  if (shared.error) throw shared.error;

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/devis/${quote.id}`);
  await page.getByRole('button', { name: 'Accepté' }).click();
  await page.getByRole('button', { name: 'Enregistrer l’accord' }).click();
  await expect(page.getByText('Accepté', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Travaux réalisés avant le devis' })).toHaveCount(0);

  // Sur l'OR : pas de bandeau « Travaux réalisés avant le devis »
  await page.goto(`/or/${order.data}`);
  await expect(page.getByText('Remplacement turbocompresseur').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Travaux réalisés avant le devis' })).toHaveCount(0);
});
