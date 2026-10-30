import { expect, test, type Page, type TestInfo } from '@playwright/test';
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

const suffix = (testInfo: TestInfo) =>
  `${String(Date.now()).slice(-5)}${Math.floor(Math.random() * 90 + 10)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;

test('page Échéances : un mail par client pour ses véhicules, plus de relance pendant 3 mois', async ({
  page,
}, testInfo) => {
  const id = suffix(testInfo);
  const client = `Flotte ${id}`;
  // Client avec deux camions : contrôle technique dépassé, hayon du mois en cours
  sql(`with c as (insert into public.clients (name, email) values ('${client}', 'parc.${id.toLowerCase()}@exemple.fr') returning id)
       insert into public.vehicles (plate, client_id, vehicle_type, ct_due_date, tailgate_due_date)
       select 'RA${id}', c.id, 'pl'::public.vehicle_type, current_date - 10, null from c
       union all select 'RB${id}', c.id, 'pl'::public.vehicle_type, null, date_trunc('month', current_date)::date from c`);
  const sent: Record<string, unknown>[] = [];
  await page.route('**/functions/v1/mail-send', async (route) => {
    sent.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ json: { id: 'envoi-e2e' } });
  });
  // Envoi par l'appli activé pour l'essai (sans e-mail réel : mail-send simulé)
  await page.route('**/rest/v1/app_settings?*mail_send_enabled*', async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as Record<string, unknown> | Record<string, unknown>[];
    const rows = Array.isArray(body) ? body : [body];
    await route.fulfill({
      response,
      json: Array.isArray(body)
        ? rows.map((row) => ({ ...row, mail_send_enabled: true }))
        : { ...body, mail_send_enabled: true },
    });
  });

  await loginAs(page, 'reception@rts.local');
  await page.goto('/vehicules/echeances');
  await expect(page.getByRole('row', { name: new RegExp(`RA${id}`) })).toBeVisible();
  await page.getByRole('button', { name: /Relancer les échéances/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Relancer les échéances' });
  const others = dialog.getByRole('checkbox', { name: /^Relancer / });
  // Seul ce client : les autres de la base locale sont décochés
  for (const box of await others.all()) {
    if ((await box.getAttribute('aria-label')) !== `Relancer ${client}` && (await box.isChecked()))
      await box.uncheck();
  }
  await expect(dialog.getByText(`RA${id} : contrôle technique dépassé depuis le`)).toBeVisible();
  await expect(dialog.getByText(`RB${id} : contrôle hayon à faire avant fin`)).toBeVisible();
  await dialog.getByRole('button', { name: /Envoyer 1 mail/ }).click();
  await expect(dialog.getByText(`Relancé (parc.${id.toLowerCase()}@exemple.fr)`)).toBeVisible();
  expect(sent).toHaveLength(1);
  expect(String(sent[0]?.text)).toContain(`- RA${id} : contrôle technique dépassé`);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // Les deux véhicules sont notés relancés : plus de relance pendant 3 mois
  await expect(page.getByRole('row', { name: new RegExp(`RA${id}`) })).toContainText('Relancé le');
  await expect(page.getByRole('row', { name: new RegExp(`RB${id}`) })).toContainText('Relancé le');
  expect(
    sql(`select count(*) from public.deadline_reminders r join public.vehicles v on v.id = r.vehicle_id
         where v.plate in ('RA${id}', 'RB${id}') and r.source = 'page'`),
  ).toBe('2');
  await page.getByRole('button', { name: /Relancer les échéances/ }).click();
  await expect(page.getByRole('dialog', { name: 'Relancer les échéances' }).getByText(client)).toHaveCount(0);
});
