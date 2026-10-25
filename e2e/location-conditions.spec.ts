import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
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

const uid = (testInfo: TestInfo) =>
  `${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-6)}`;

test('conditions générales du contrat type : lues par le client avant de signer et au comptoir', async ({
  page,
  browser,
}, testInfo) => {
  test.slow();
  const id = uid(testInfo);
  const rental = crypto.randomUUID();
  // Contrat au mois réservé : 900 € HT par mois, sans dépôt de garantie
  sql(
    `with vehicle as (
       insert into public.fleet_vehicles (plate, brand, model, category, daily_rate, month_rate, license_category)
       values ('CG-${id}', 'Iveco', 'Daily', 'van', 90, 900, 'B') returning id),
     client as (
       insert into public.clients (name, billing_address, email)
       values ('Conditions ${id}', '1 rue du Fret, 95190 Goussainville', 'cg.${id.toLowerCase()}@exemple.fr') returning id)
     insert into public.rentals (id, client_id, fleet_vehicle_id, departure_at, planned_return_at, rate_period,
                                 unit_price, periods, deposit)
     select '${rental}', client.id, vehicle.id, now() + interval '1 day', now() + interval '31 days', 'month', 900, 1, 0
     from vehicle, client`,
  );
  const api = createClient<Database>(env.VITE_SUPABASE_URL ?? '', env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '', {
    auth: { persistSession: false },
  });
  await api.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const request = await api.rpc('request_rental_signature', { p_rental_id: rental });
  if (request.error) throw request.error;
  const token = (request.data as { token: string }).token;

  // Client, sans compte : les conditions générales sous le contrat, avant la signature
  const context = await browser.newContext({ ...testInfo.project.use });
  const client = await context.newPage();
  await client.goto(`/d/${token}`);
  const terms = client.getByRole('list', { name: 'Conditions générales de location' });
  await expect(terms).toContainText('Article 1 : Durée de la location');
  await expect(terms).toContainText('pour des périodes successives de un (1) mois');
  await expect(terms).toContainText(/Le loyer est de 900,00\s€ HT par mois/);
  await expect(terms).toContainText('Aucun dépôt de garantie n’est demandé pour ce contrat.');
  await expect(terms).toContainText('Article 10 : Droit applicable et juridiction compétente');
  await context.close();

  // Comptoir : conditions lisibles à l'étape de la signature
  await loginAs(page, 'reception@rts.local');
  await page.goto(`/location/contrats/${rental}/depart?etape=4`);
  await page.getByText('Lire les conditions générales de location').click();
  await expect(page.getByRole('list', { name: 'Conditions générales de location' })).toContainText(
    'Article 6 : Assurance',
  );
});
