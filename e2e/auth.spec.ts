import { expect, test, type Page } from '@playwright/test';

// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';

async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

test('une page protégée renvoie vers la connexion', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/connexion$/);
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
});

test('identifiants incorrects', async ({ page }) => {
  await login(page, 'direction@rts.local', 'mauvais-mot-de-passe');
  await expect(page.getByText('Identifiants incorrects.')).toBeVisible();
  await expect(page).toHaveURL(/\/connexion$/);
});

test('la direction se connecte puis se déconnecte', async ({ page }) => {
  await login(page, 'direction@rts.local');
  await expect(page.getByRole('heading', { name: /Bonjour Direction RTS/ })).toBeVisible();
  await expect(page.getByText('Espace Direction')).toBeVisible();

  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page).toHaveURL(/\/connexion$/);
});

test('un technicien arrive sur son espace', async ({ page }) => {
  await login(page, 'alice@rts.local');
  await expect(page.getByText('Espace Technicien')).toBeVisible();
});

test('la session est conservée au rechargement', async ({ page }) => {
  await login(page, 'reception@rts.local');
  await expect(page.getByText('Espace Réception')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Espace Réception')).toBeVisible();
});

test('page inconnue', async ({ page }) => {
  await page.goto('/page-qui-n-existe-pas');
  await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible();
});

test('installable en appli (manifeste PWA)', async ({ page, request }) => {
  await page.goto('/connexion');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const manifest = (await (await request.get(href!)).json()) as { display: string; lang: string };
  expect(manifest.display).toBe('standalone');
  expect(manifest.lang).toBe('fr');
});
