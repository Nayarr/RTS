import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'atelier-dev-2026';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
}

test('le technicien ouvre l’aide depuis le menu et imprime le mémo', async ({ page }) => {
  await loginAs(page, 'alice@rts.local');
  await page.getByRole('link', { name: 'Aide' }).click();
  await expect(page.getByRole('heading', { name: 'Aide', level: 1 })).toBeVisible();
  const tech = page.getByRole('region', { name: 'Pour les techniciens' });
  await tech.getByRole('button', { name: 'Terminer', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Terminer' })).toContainText('Travaux terminés');
  await expect(page.getByRole('region', { name: 'Pour la réception et la direction' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Fiche mémo technicien (PDF)' }).click();
  await expect(page.getByRole('dialog', { name: 'Aperçu' })).toContainText('Memo_technicien.pdf');
});

test('la direction voit les sujets du bureau et de la direction', async ({ page }) => {
  await loginAs(page, 'direction@rts.local');
  await page.goto('/aide');
  await expect(page.getByRole('region', { name: 'Pour la réception et la direction' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Pour la direction' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Questions fréquentes' })).toBeVisible();
});
