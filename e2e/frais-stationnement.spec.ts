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

test('direction : tarifs de stationnement par type de véhicule dans les réglages', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Réglage global : une seule fois');
  await loginAs(page, 'direction@rts.local');
  await page.goto('/reglages?section=facturation');
  await page.getByRole('tab', { name: 'Devis et factures' }).click();
  try {
    await page.getByLabel('Remorque', { exact: true }).fill('25');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Réglages de facturation enregistrés')).toBeVisible();
    expect(sql('select parking_rate_remorque from public.company_settings')).toBe('25.00');
  } finally {
    sql('update public.company_settings set parking_rate_remorque = 20');
  }
});

test('OR : « Frais de stationnement » demande le départ prévu et génère la facture', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Fiche OR du bureau');
  const id = String(Date.now()).slice(-6);
  const plate = `FS-${id}`;
  const order = sql(
    `with c as (insert into public.clients (name) values ('Transports Parking ${id}') returning id),
          v as (insert into public.vehicles (plate, vehicle_type, client_id) select '${plate}', 'pl', id from c
                returning id, client_id)
     insert into public.repair_orders (vehicle_id, client_id, requested_work, status)
     select id, client_id, 'Embrayage', 'to_invoice' from v returning id`,
  ).split('\n')[0];
  const rate = Number(sql('select parking_rate_pl from public.company_settings'));

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/or/${order}`);
  await page.getByRole('button', { name: 'Frais de stationnement' }).click();
  const dialog = page.getByRole('dialog', { name: 'Facturer le stationnement' });
  await dialog.getByLabel('Parti le').fill('2026-11-11');
  await dialog.getByLabel('Départ prévu le').fill('2026-11-07');
  await expect(dialog.getByRole('status', { name: 'Montant du stationnement' })).toContainText(
    'Stationné 4 jours de trop',
  );
  await dialog.getByRole('button', { name: 'Générer la facture' }).click();

  await expect(page).toHaveURL(/\/factures\/[0-9a-f-]{36}$/);
  await expect(
    page.getByText(/Frais de stationnement · OR .* départ prévu le 07\/11\/2026, parti le 11\/11\/2026/),
  ).toBeVisible();
  const invoice = page.url().split('/').at(-1);
  expect(
    sql(
      `select quantity::int || ' x ' || unit_price from public.invoice_lines where invoice_id = '${invoice}'`,
    ),
  ).toBe(`4 x ${rate.toFixed(2)}`);
});
