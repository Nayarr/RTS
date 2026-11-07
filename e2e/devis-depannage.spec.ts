import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';

const env = loadEnv('production', process.cwd(), 'VITE_');
// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';
const ADDRESS = 'Aire de Roissy, 95700 Roissy-en-France';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();
}

const uniquePlate = (testInfo: TestInfo) =>
  `DV${String(Date.now()).slice(-6)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;

test('devis sans OR : dépannage en zone 3, ligne au devis, OR créé, déplacement facturé une fois', async ({
  page,
}, testInfo) => {
  test.slow();
  const plate = uniquePlate(testInfo);
  const api = createClient<Database>(env.VITE_SUPABASE_URL ?? '', env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '', {
    auth: { persistSession: false },
  });
  await api.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: quote, error } = await api.rpc('create_quote', {
    p_client_name: `Client devis ${plate}`,
    p_plate: plate,
    p_vehicle_type: 'pl',
  });
  if (error) throw error;
  const added = await api.from('quote_lines').insert({
    quote_id: quote.id,
    position: 0,
    line_type: 'labor',
    description: 'Remplacement pneu',
    estimated_hours: 1,
    unit_price: 90,
    quantity: 1,
  });
  if (added.error) throw added.error;

  // Adresses (IGN) et trajet (TomTom) simulés
  await page.route('https://data.geopf.fr/geocodage/search?*', (route) =>
    route.fulfill({
      json: { features: [{ properties: { label: ADDRESS }, geometry: { coordinates: [2.55, 49.01] } }] },
    }),
  );
  await page.route('**/functions/v1/trajet', (route) =>
    route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: { km: 30, minutes: 60 } }),
  );

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/devis/${quote.id}`);
  const roadside = page.getByRole('region', { name: 'Lieu d’intervention' });
  await roadside.getByRole('checkbox', { name: /Dépannage extérieur/ }).check();
  await roadside.getByLabel('Lieu d’intervention').fill('aire de roissy');
  await roadside.getByRole('option', { name: /Aire de Roissy/ }).click();
  await roadside.getByRole('button', { name: /Calculer le trajet/ }).click();
  await expect(roadside.getByRole('status')).toContainText(/Zone 3 : 130,00\s€ HT \(forfait\)/);
  await roadside.getByRole('button', { name: 'Enregistrer' }).click();

  // La ligne arrive dans les travaux à prévoir
  const planned = page.getByRole('region', { name: 'Travaux à prévoir' });
  await expect(planned.getByText(`Forfait déplacement zone 3 · ${ADDRESS}`)).toBeVisible();

  // Le client le voit en haut du lien
  const token = await api.rpc('share_quote', { p_quote_id: quote.id });
  if (token.error) throw token.error;
  const client = await page.context().newPage();
  await client.goto(`/d/${token.data}`);
  const summary = client.getByRole('group', { name: 'Dépannage extérieur' });
  await expect(summary).toContainText(`Lieu d’intervention : ${ADDRESS}`);
  await expect(summary).toContainText(/130,00\s€ HT/);
  await client.close();

  // OR créé depuis le devis : c'est un dépannage, sa facture a le déplacement une fois
  const order = await api.rpc('create_repair_order_from_quote', { p_quote_id: quote.id });
  if (order.error) throw order.error;
  const { data: created } = await api
    .from('repair_orders')
    .select('intervention_type, roadside_address, requested_work')
    .eq('id', order.data)
    .single();
  expect(created).toEqual({
    intervention_type: 'roadside',
    roadside_address: ADDRESS,
    requested_work: 'Remplacement pneu',
  });
  const draft = await api.rpc('build_invoice_draft', { p_repair_order_ids: [order.data] });
  if (draft.error) throw draft.error;
  const { data: lines } = await api
    .from('invoice_lines')
    .select('description, unit_price')
    .eq('invoice_id', draft.data)
    .eq('line_type', 'travel');
  expect(lines).toEqual([{ description: `Forfait déplacement zone 3 · ${ADDRESS}`, unit_price: 130 }]);

  // Le devis renvoie maintenant à la fiche de l'OR pour le dépannage
  await page.reload();
  await expect(roadside.getByRole('link', { name: 'à modifier sur l’OR' })).toBeVisible();
});
