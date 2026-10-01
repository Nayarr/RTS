import { expect, test, type Page } from '@playwright/test';
import { goTo } from './support/nav';

const PASSWORD = 'atelier-dev-2026';

// Le service worker précharge toute l'appli en arrière-plan : bloqué ici pour ne voir
// que ce que l'écran télécharge réellement.
test.use({ serviceWorkers: 'block' });

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
}

const scripts = (page: Page) => {
  const loaded: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'script') loaded.push(new URL(request.url()).pathname);
  });
  return loaded;
};

test('le téléphone du technicien ne télécharge pas les écrans du bureau', async ({ page }) => {
  const loaded = scripts(page);
  await loginAs(page, 'alice@rts.local');
  await expect(page.getByRole('heading', { name: /ordres de réparation/i }).first()).toBeVisible();
  await page.getByRole('link', { name: 'Aide' }).click();
  await expect(page.getByRole('heading', { name: 'Aide', level: 1 })).toBeVisible();

  expect(loaded.some((path) => /TechHomePage/.test(path))).toBe(true);
  expect(loaded.some((path) => /HelpPage/.test(path))).toBe(true);
  expect(loaded.filter((path) => /OfficeDashboardPage|InvoicePage|SettingsPage|jspdf/.test(path))).toEqual(
    [],
  );
});

test('un lien ouvert directement affiche l’écran chargé à la demande', async ({ page }) => {
  await loginAs(page, 'direction@rts.local');
  await page.goto('/pilotage/statistiques');
  await expect(page.getByRole('heading', { name: 'Pilotage', level: 1 })).toBeVisible();
  await goTo(page, null, 'Réglages');
  await expect(page.getByRole('heading', { name: 'Réglages', level: 1 })).toBeVisible();
});
