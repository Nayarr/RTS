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

const fakeFile = (category: string) =>
  `(insert into public.files (storage_key, category, mime_type, size_bytes, uploaded_at)
    values ('e2e/' || gen_random_uuid(), '${category}', 'image/jpeg', 1000, now()) returning id)`;

/**
 * Location d'une remorque prête au départ : permis scanné, contrat signé, photos des 4 côtés
 * (écrits directement en base, l'état des lieux par l'écran est couvert par location-contrats).
 */
function trailerRental(id: string) {
  const ids = {
    vehicle: crypto.randomUUID(),
    client: crypto.randomUUID(),
    license: crypto.randomUUID(),
    rental: crypto.randomUUID(),
  };
  sql(
    `insert into public.fleet_vehicles (id, plate, brand, model, category, daily_rate, license_category)
       values ('${ids.vehicle}', 'RQ-${id}', 'Schmitz', 'Cargobull', 'trailer', 60, 'BE');
     insert into public.clients (id, name, billing_address)
       values ('${ids.client}', 'Remorques ${id}', '1 rue du Fret, 95190 Goussainville');
     with recto as ${fakeFile('other')}, verso as ${fakeFile('other')}
     insert into public.driving_licenses (id, client_id, last_name, first_name, license_number, categories,
                                          valid_until, recto_file_id, verso_file_id)
       select '${ids.license}', '${ids.client}', 'DURAND', 'Paul', '9103952${id.slice(-5)}', '{B,BE}', '2033-06-22',
              recto.id, verso.id from recto, verso;
     with signature as ${fakeFile('signature')}
     insert into public.rentals (id, client_id, fleet_vehicle_id, driving_license_id, departure_at, planned_return_at,
                                 unit_price, periods, signature_file_id, signed_at, terms_accepted)
       select '${ids.rental}', '${ids.client}', '${ids.vehicle}', '${ids.license}', now(), now() + interval '2 days',
              60, 2, signature.id, now(), true from signature;
     with photos as (
       insert into public.files (storage_key, category, mime_type, size_bytes, uploaded_at)
       select 'e2e/' || gen_random_uuid() || '/' || s, 'ro_photo', 'image/jpeg', 1000, now()
       from unnest(array['front', 'back', 'left', 'right']) s
       returning id, storage_key)
     insert into public.rental_photos (rental_id, phase, slot, file_id)
       select '${ids.rental}', 'departure', split_part(storage_key, '/', 3)::public.rental_photo_slot, id
       from photos;`,
  );
  return ids;
}

test('remorque : clés remises sans tableau de bord, facture de la location prête à émettre', async ({
  page,
}, testInfo) => {
  test.slow();
  const id = uid(testInfo);
  const ids = trailerRental(id);

  // Remise des clés (réception) : la remorque part sans photo du tableau de bord
  const reception = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      auth: { persistSession: false },
    },
  );
  await reception.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const missing = await reception.rpc('rental_missing', { p_rental_id: ids.rental, p_phase: 'departure' });
  expect(missing.data).toEqual([]);
  const started = await reception.rpc('start_rental', { p_rental_id: ids.rental });
  expect(started.error).toBeNull();

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/location/contrats/${ids.rental}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('En cours');
  await page.getByRole('link', { name: 'Émettre la facture de départ' }).click();
  await expect(page).toHaveURL(/\/factures\//);
  await expect(
    page.getByText(`Location Schmitz Cargobull · RQ-${id}`, { exact: false }).first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Émettre la facture' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Émettre/ })
    .click();
  await expect(page.getByText(/Facture émise/).first()).toBeVisible();

  // Retour d'une remorque : pas de carte « Tableau de bord » (ni compteur, ni carburant)
  await page.goto(`/location/contrats/${ids.rental}/retour`);
  await expect(page.getByRole('heading', { name: /Photos du véhicule|Photos/ }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toHaveCount(0);
});
