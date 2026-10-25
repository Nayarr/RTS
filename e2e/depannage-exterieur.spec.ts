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
  `DE${String(Date.now()).slice(-6)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;

/** Adresses (IGN) et trajet (TomTom) simulés : rien ne part sur internet pendant le test. */
async function fakeMaps(page: Page) {
  await page.route('https://data.geopf.fr/geocodage/search?*', (route) =>
    route.fulfill({
      json: {
        features: [
          {
            properties: { label: 'Aire de Roissy, 95700 Roissy-en-France' },
            geometry: { coordinates: [2.55, 49.01] },
          },
        ],
      },
    }),
  );
  const asked: unknown[] = [];
  await page.route('**/functions/v1/trajet', async (route) => {
    asked.push(route.request().postDataJSON());
    await route.fulfill({
      headers: { 'access-control-allow-origin': '*' },
      json: { km: 15, minutes: 70 },
    });
  });
  return asked;
}

test('OR en dépannage extérieur : lieu, trajet calculé, déplacement de la zone 2 à la facture', async ({
  page,
}, testInfo) => {
  test.slow();
  const plate = uniquePlate(testInfo);
  const asked = await fakeMaps(page);
  await loginAs(page, 'reception@rts.local');

  await page.goto('/or/nouveau');
  await page.getByLabel('Immatriculation').fill(plate);
  await page.getByLabel('Client', { exact: true }).fill('Transports E2E');
  await page.getByLabel('Tâche à faire').fill('Crevaison sur l’aire');
  await page.getByRole('combobox', { name: 'Assigner à' }).click();
  await page.getByRole('option', { name: 'Alice' }).click();

  const roadside = page.getByRole('region', { name: 'Lieu d’intervention' });
  await roadside.getByRole('checkbox', { name: /Dépannage extérieur/ }).check();
  await roadside.getByLabel('Lieu d’intervention').fill('aire de roissy');
  await roadside.getByRole('option', { name: /Aire de Roissy/ }).click();
  await roadside.getByRole('button', { name: /Calculer le trajet/ }).click();
  await expect(roadside.getByLabel('Distance aller-retour (km)')).toHaveValue('15');
  await expect(roadside.getByLabel('Trajet aller-retour (min)')).toHaveValue('70');
  await expect(roadside.getByRole('status')).toContainText(
    /Zone 2 : 105,00\s€ HT \(1 h 10 de trajet facturé\)/,
  );
  expect(asked[0]).toMatchObject({ to: { lat: 49.01, lon: 2.55 } });

  await page.getByRole('button', { name: 'Créer l’OR' }).click();
  await expect(page.getByRole('link', { name: plate, exact: true })).toBeVisible();
  const card = page.getByRole('region', { name: 'Lieu d’intervention' });
  await expect(card.getByLabel('Lieu d’intervention')).toHaveValue('Aire de Roissy, 95700 Roissy-en-France');

  // Facture : une ligne de déplacement, temps de trajet de la zone 2
  const orderId = page.url().split('/or/')[1]!.split('?')[0]!;
  const api = createClient<Database>(env.VITE_SUPABASE_URL ?? '', env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '', {
    auth: { persistSession: false },
  });
  await api.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const draft = await api.rpc('build_invoice_draft', { p_repair_order_ids: [orderId] });
  if (draft.error) throw draft.error;
  const { data: lines } = await api
    .from('invoice_lines')
    .select('description, unit_price')
    .eq('invoice_id', draft.data)
    .eq('line_type', 'travel');
  expect(lines).toEqual([
    {
      description:
        'Déplacement zone 2 : 1 h 10 de trajet aller-retour · Aire de Roissy, 95700 Roissy-en-France',
      unit_price: 105,
    },
  ]);

  // Le mécano voit le lieu d'intervention
  await page.getByRole('button', { name: 'Se déconnecter' }).first().click();
  await loginAs(page, 'alice@rts.local');
  await page.goto(`/atelier/or/${orderId}`);
  await expect(page.getByText('Aire de Roissy, 95700 Roissy-en-France')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Itinéraire' })).toHaveAttribute(
    'href',
    /google\.com\/maps\/dir/,
  );
});
