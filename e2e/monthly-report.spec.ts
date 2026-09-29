import { expect, test, type Page } from '@playwright/test';
import { parisDay } from './support/dates';

const PASSWORD = 'atelier-dev-2026';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
}

test('la direction génère le rapport mensuel en PDF', async ({ page }) => {
  test.slow();
  const month = parisDay(0).slice(0, 7);

  await loginAs(page, 'direction@rts.local');
  await page.goto('/pilotage/tresorerie');
  await page.getByRole('button', { name: 'Rapport mensuel' }).click();
  const dialog = page.getByRole('dialog', { name: 'Rapport mensuel' });
  await dialog.getByLabel('Mois').fill(month);
  await dialog.getByRole('button', { name: 'Générer le rapport PDF' }).click();

  const preview = page.getByRole('dialog', { name: 'Aperçu' });
  await expect(preview.getByTitle('Aperçu du PDF')).toBeVisible();
  await expect(preview).toContainText(`Rapport_mensuel_${month}.pdf`);
  const download = page.waitForEvent('download');
  await preview.getByRole('link', { name: 'Télécharger' }).click();
  expect((await download).suggestedFilename()).toBe(`Rapport_mensuel_${month}.pdf`);
});
