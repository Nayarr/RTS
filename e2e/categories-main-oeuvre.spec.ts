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
  `MC${String(Date.now()).slice(-6)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;

test('devis : catégorie de main d’œuvre en pastille, changée au stylo avec le taux de la catégorie', async ({
  page,
}, testInfo) => {
  const plate = uniquePlate(testInfo);
  const api = createClient<Database>(env.VITE_SUPABASE_URL ?? '', env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '', {
    auth: { persistSession: false },
  });
  await api.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: quote, error } = await api.rpc('create_quote', {
    p_client_name: `Client catégories ${plate}`,
    p_plate: plate,
    p_vehicle_type: 'pl',
  });
  if (error) throw error;
  const { data: rates } = await api.from('labor_rates').select('category, hourly_rate');
  const rateOf = (category: string) => Number(rates?.find((rate) => rate.category === category)?.hourly_rate);
  const added = await api
    .from('quote_lines')
    .insert({
      quote_id: quote.id,
      position: 0,
      line_type: 'labor',
      description: 'Soudure support pare-chocs',
      unit_price: rateOf('pl'),
      quantity: 2,
      labor_category: 'pl',
    })
    .select('id')
    .single();
  if (added.error) throw added.error;

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/devis/${quote.id}`);
  await expect(page.getByText('MO PL · 2 h')).toBeVisible();
  await page
    .getByRole('button', { name: 'Changer la catégorie de main d’œuvre de Soudure support pare-chocs' })
    .click();
  await page
    .getByRole('combobox', { name: 'Catégorie de main d’œuvre de Soudure support pare-chocs' })
    .selectOption('remorque');
  await expect(page.getByText(/^MO .+ · 2 h$/)).not.toHaveText('MO PL · 2 h');

  await expect
    .poll(async () => {
      const { data } = await api
        .from('quote_lines')
        .select('labor_category, unit_price')
        .eq('id', added.data.id)
        .single();
      return data;
    })
    .toEqual({ labor_category: 'remorque', unit_price: rateOf('remorque') });
});

test('statistiques : un CA par catégorie de main d’œuvre', async ({ page }) => {
  await loginAs(page, 'direction@rts.local');
  await page.goto('/pilotage/statistiques');
  const section = page.getByRole('region', { name: 'CA main d’œuvre par catégorie · 12 derniers mois' });
  await expect(section.getByRole('listitem')).toHaveCount(4);
  await expect(section.getByRole('listitem').first()).toContainText('Main d’œuvre PL');
});
