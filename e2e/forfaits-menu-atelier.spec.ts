import { expect, test } from '@playwright/test';

// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';

test('forfaits dans le menu Atelier ; l’ancienne adresse du stock y mène', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Menu latéral du bureau');
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill('direction@rts.local');
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();

  const side = page.getByRole('navigation', { name: 'Navigation principale' });
  await side.getByRole('button', { name: 'Atelier' }).click();
  await side.getByRole('link', { name: 'Forfaits' }).click();
  await expect(page).toHaveURL(/\/forfaits$/);
  await expect(page.getByRole('heading', { name: 'Forfaits' })).toBeVisible();
  // Plus d'onglets du stock sur la page des forfaits
  await expect(page.getByRole('navigation', { name: 'Catalogues' })).toHaveCount(0);

  // Ancienne adresse (liens gardés)
  await page.goto('/stock/forfaits');
  await expect(page).toHaveURL(/\/forfaits$/);
  await expect(page.getByRole('heading', { name: 'Forfaits' })).toBeVisible();
});
