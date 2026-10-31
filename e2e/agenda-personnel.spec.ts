import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { sql } from './support/db';
import { goTo } from './support/nav';

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
  `${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-7)}`;

test('agenda personnel : rendez-vous posé par la réception, invisible pour la direction', async ({
  page,
  browser,
}, testInfo) => {
  const title = `Banque ${suffix(testInfo)}`;
  // Jour propre au test (agenda partagé entre les essais) : un mercredi de 2030
  const day = '2030-01-16';

  await loginAs(page, 'reception@rts.local');
  await goTo(page, null, 'Mon agenda');
  await expect(page.getByRole('heading', { name: 'Mon agenda', level: 1 })).toBeVisible();
  await page.goto(`/agenda?vue=jour&date=${day}`);
  await expect(page.getByRole('heading', { name: 'mercredi 16 janvier 2030' })).toBeVisible();

  await page.getByRole('button', { name: /Nouveau rendez-vous/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Nouveau rendez-vous' });
  await dialog.getByLabel('Objet').fill(title);
  await dialog.getByLabel('Date').fill(day);
  await dialog.getByLabel('Début').fill('14:00');
  await dialog.getByLabel('Fin').fill('15:30');
  await dialog.getByLabel('Lieu (facultatif)').fill('Roissy');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Rendez-vous ajouté à ton agenda')).toBeVisible();
  const block = page.getByRole('button', { name: `${title}, 14:00 - 15:30, Roissy` });
  await expect(block).toBeVisible();
  expect(
    sql(`select p.email from public.personal_events e join public.profiles p on p.id = e.profile_id
         where e.title = '${title}'`),
  ).toBe('reception@rts.local');

  // La direction a son propre agenda : celui de la réception n'y est pas
  const other = await browser.newPage();
  await loginAs(other, 'direction@rts.local');
  await other.goto(`/agenda?vue=jour&date=${day}`);
  await expect(other.getByRole('heading', { name: 'mercredi 16 janvier 2030' })).toBeVisible();
  await expect(other.getByText('Aucun rendez-vous.')).toBeVisible();
  await expect(other.getByRole('button', { name: new RegExp(`^${title}`) })).toHaveCount(0);
  await other.close();

  // Modifié en journée entière, puis supprimé
  await block.click();
  const edit = page.getByRole('dialog', { name: 'Rendez-vous' });
  await edit.getByLabel('Journée entière').check();
  await edit.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('button', { name: `${title}, journée entière, Roissy` }).first()).toBeVisible();
  await page
    .getByRole('button', { name: `${title}, journée entière, Roissy` })
    .first()
    .click();
  await page.getByRole('dialog', { name: 'Rendez-vous' }).getByRole('button', { name: 'Supprimer' }).click();
  await page
    .getByRole('dialog', { name: 'Supprimer ce rendez-vous ?' })
    .getByRole('button', { name: 'Supprimer' })
    .click();
  await expect(page.getByText('Rendez-vous supprimé')).toBeVisible();
  expect(sql(`select count(*) from public.personal_events where title = '${title}'`)).toBe('0');
});
