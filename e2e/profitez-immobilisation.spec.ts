import { expect, test, type Page } from '@playwright/test';
import { sql } from './support/db';

// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();
}

/** Envoi par l'appli vu comme activé par ce navigateur seulement, service d'envoi simulé. */
async function simulateMailService(page: Page) {
  await page.route('**/rest/v1/app_settings?select=mail_send_enabled*', (route) =>
    route.fulfill({
      json: {
        mail_send_enabled: true,
        mail_domain: 'rapidtruckservice.fr',
        mail_billing_local: 'facturation',
        mail_workshop_local: 'atelier',
        mail_signature_local: 'signature',
      },
    }),
  );
  const requests: Record<string, unknown>[] = [];
  await page.route('**/functions/v1/mail-send', async (route) => {
    requests.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ json: { id: 're_e2e_echeances' } });
  });
  return requests;
}

test('camion à l’atelier : échéances proposées sur l’OR, mail modèle modifié puis envoyé', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Fiche OR du bureau');
  const id = String(Date.now()).slice(-6);
  const plate = `PI-${id}`;
  const client = `Transports Martin ${id}`;
  // Véhicule : contrôle technique dans 20 jours (jour de Paris, comme l’appli) ; vidange faite il y a 58 000 km
  const order = sql(
    `with c as (insert into public.clients (name, email) values ('${client}', 'contact.${id}@e2e.fr') returning id),
          v as (insert into public.vehicles (plate, vehicle_type, client_id, ct_due_date)
                select '${plate}', 'pl', id, public.paris_date(now()) + 20 from c returning id, client_id),
          old as (insert into public.repair_orders (vehicle_id, client_id, requested_work, status, mileage, created_at)
                  select id, client_id, 'Vidange moteur', 'assigned', 400000, now() - interval '8 months' from v
                  returning id),
          l as (insert into public.ro_lines (repair_order_id, kind, position, line_type, description)
                select id, 'planned', 0, 'labor', 'Vidange moteur et filtres' from old returning id)
     insert into public.repair_orders (vehicle_id, client_id, requested_work, status, mileage)
     select id, client_id, 'Remplacement embrayage', 'in_progress', 458000 from v returning id`,
  ).split('\n')[0];
  const requests = await simulateMailService(page);

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/or/${order}`);
  const card = page.getByRole('region', { name: 'Profitez de l’immobilisation' });
  const items = card.getByRole('list', { name: 'Échéances à proposer' });
  await expect(items).toContainText('Contrôle technique');
  await expect(items).toContainText('Dans 20 j');
  await expect(items).toContainText('58 000 km depuis la dernière');
  await expect(items).toContainText('aucun contrôle enregistré à l’atelier');

  await card.getByRole('button', { name: 'Proposer au client' }).click();
  const dialog = page.getByRole('dialog', { name: 'Profitez de l’immobilisation' });
  const text = dialog.getByLabel('Message', { exact: true });
  await expect(text).toHaveValue(new RegExp(`Votre véhicule ${plate} de ${client} est actuellement`));
  await expect(text).toHaveValue(/- Contrôle technique : à faire avant le /);
  await expect(text).toHaveValue(/- Vidange : 58 000 km depuis la dernière/);
  // Modèle modifiable avant l'envoi
  await text.fill(`${await text.inputValue()}\n\nPS : nous avons un créneau jeudi.`);
  await dialog.getByRole('button', { name: 'Envoyer l’e-mail' }).click();
  await expect(page.getByText(`E-mail envoyé à contact.${id}@e2e.fr`)).toBeVisible({ timeout: 20_000 });

  expect(requests).toHaveLength(1);
  const [sent] = requests as [{ category: string; to: string; subject: string; text: string }];
  expect(sent.category).toBe('workshop');
  expect(sent.to).toBe(`contact.${id}@e2e.fr`);
  expect(sent.subject).toContain(`Profitez de l’immobilisation de votre véhicule ${plate}`);
  expect(sent.text).toContain('PS : nous avons un créneau jeudi.');
  await expect(
    page.getByRole('region', { name: 'Historique' }).getByText(/Échéances proposées/),
  ).toBeVisible();
});

test('création d’OR : échéances du véhicule connu ajoutées aux tâches', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Création d’OR au bureau');
  const id = String(Date.now()).slice(-6);
  const plate = `CO-${id}`;
  // Poids lourd connu : contrôle technique dans 10 jours, vidange il y a plus d'un an
  sql(
    `with c as (insert into public.clients (name) values ('Transports Création ${id}') returning id),
          v as (insert into public.vehicles (plate, vehicle_type, client_id, ct_due_date)
                select '${plate}', 'pl', id, public.paris_date(now()) + 10 from c returning id)
     insert into public.vehicle_oil_changes (vehicle_id, done_on, mileage)
     select id, public.paris_date(now()) - 400, 380000 from v`,
  );

  await loginAs(page, 'reception@rts.local');
  await page.goto('/or/nouveau');
  await page.getByLabel('Immatriculation').fill(plate);
  const upcoming = page.getByRole('region', { name: 'Échéances du véhicule' });
  const items = upcoming.getByRole('list', { name: 'Échéances à proposer' });
  await expect(items).toContainText('Contrôle technique');
  await expect(items).toContainText(/dernière vidange le .*, il y a plus d’un an/);

  await page.getByLabel('Tâche à faire').fill('Disques et plaquettes avant');
  await upcoming.getByRole('button', { name: 'Ajouter aux tâches : Contrôle technique' }).click();
  await upcoming.getByRole('button', { name: 'Ajouter aux tâches : Vidange' }).click();
  await expect(page.getByLabel('Tâche à faire')).toHaveValue(
    'Disques et plaquettes avant\nContrôle technique\nVidange',
  );
  // Déjà dans les tâches : plus proposées
  await expect(items).not.toContainText('Contrôle technique');
});

test('création d’OR d’un nouveau véhicule : vidange dite par le client notée sur la fiche', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Création d’OR au bureau');
  const id = String(Date.now()).slice(-6);
  const plate = `NV-${id}`;

  await loginAs(page, 'reception@rts.local');
  await page.goto('/or/nouveau');
  await page.getByLabel('Immatriculation').fill(plate);
  await page.getByLabel('Client', { exact: true }).fill('Transports E2E');
  await page.getByLabel('Tâche à faire').fill('Disques et plaquettes avant');
  const upcoming = page.getByRole('region', { name: 'Échéances du véhicule' });
  await upcoming.getByLabel('Date de la vidange').fill('2026-05-12');
  await upcoming.getByLabel('Kilométrage de la vidange (facultatif)').fill('412 000');
  await page.getByRole('button', { name: 'Créer l’OR' }).click();
  await expect(page.getByRole('link', { name: plate, exact: true })).toBeVisible();

  const vehicle = sql(`select id from public.vehicles where plate = '${plate}'`);
  expect(
    sql(`select done_on || ' ' || mileage from public.vehicle_oil_changes where vehicle_id = '${vehicle}'`),
  ).toBe('2026-05-12 412000');
  await page.goto(`/vehicules/${vehicle}`);
  await expect(page.getByRole('list', { name: 'Vidanges hors atelier' })).toContainText(
    /Vidange du 12\/05\/2026 · 412.000 km · dite par le client/,
  );
});

test('devis : plus de 40 000 km depuis la dernière vidange, vidange proposée puis ajoutée', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Devis du bureau');
  const id = String(Date.now()).slice(-6);
  const plate = `DV-${id}`;
  // Vidange faite à 400 000 km ; le technicien relève 441 000 km sur l'OR
  const order = sql(
    `with c as (insert into public.clients (name) values ('Transports Devis ${id}') returning id),
          v as (insert into public.vehicles (plate, vehicle_type, client_id) select '${plate}', 'pl', id from c
                returning id, client_id),
          d as (insert into public.vehicle_oil_changes (vehicle_id, done_on, mileage)
                select id, public.paris_date(now()) - 90, 400000 from v)
     insert into public.repair_orders (vehicle_id, client_id, requested_work, status, mileage)
     select id, client_id, 'Disques et plaquettes avant', 'in_progress', 441000 from v returning id`,
  ).split('\n')[0];
  const quote = sql(
    `select set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where email = 'reception@rts.local'), 'role', 'authenticated')::text, false);
     select public.build_quote_from_repair_order('${order}')`,
  )
    .split('\n')
    .find((row) => /^[0-9a-f-]{36}$/.test(row));

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/devis/${quote}`);
  const suggestion = page.getByRole('status', { name: 'Vidange à proposer' });
  await expect(suggestion).toContainText('41 000 km depuis la dernière vidange (à 400 000 km le');
  await expect(suggestion).toContainText('conseillée tous les 40 000 km');
  await suggestion.getByRole('button', { name: 'Ajouter la vidange' }).click();
  await expect(suggestion).toHaveCount(0);
  expect(
    Number(
      sql(
        `select count(*) from public.quote_lines where quote_id = '${quote}' and description ilike '%vidange%'`,
      ),
    ),
  ).toBe(1);
});
