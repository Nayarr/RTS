import { expect, test, type Page } from '@playwright/test';
import { parisDay } from './support/dates';

// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();
}

test('nouvel OR daté sans heure : la date est gardée, l’OR attend ce jour-là chez le technicien', async ({
  page,
  browser,
}, testInfo) => {
  const plate = `DS${String(Date.now()).slice(-7)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;
  const tomorrow = parisDay(1);

  await loginAs(page, 'reception@rts.local');
  await page.goto('/or/nouveau');
  await page.getByLabel('Immatriculation').fill(plate);
  await page.getByLabel('Client', { exact: true }).fill('Transports E2E');
  await page.getByLabel('Tâche à faire').fill('Contrôle hayon');
  await page.getByRole('combobox', { name: 'Assigner à' }).click();
  await page.getByRole('option', { name: 'Alice' }).click();
  await page.getByLabel('Date prévue').fill(tomorrow);
  await expect(page.getByLabel('Heure de début')).toHaveValue('');
  await page.getByRole('button', { name: 'Créer l’OR' }).click();

  // Fiche de l'OR : la date prévue est enregistrée, sans heure
  await expect(page.getByRole('link', { name: plate, exact: true })).toBeVisible();
  await expect(page.getByLabel('Date prévue')).toHaveValue(tomorrow);
  await expect(page.getByLabel('Heure de début')).toHaveValue('');

  // Chez le technicien : pas encore visible aujourd'hui (prévu demain)
  const tech = await browser.newContext();
  const techPage = await tech.newPage();
  await loginAs(techPage, 'alice@rts.local');
  await expect(techPage.getByRole('heading', { name: 'Mes ordres de réparation' })).toBeVisible();
  await expect(techPage.getByRole('link', { name: new RegExp(plate) })).toHaveCount(0);
  await tech.close();
});
