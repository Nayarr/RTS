import { expect, test, type Page } from '@playwright/test';
import { goTo, sideNav } from './support/nav';

// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();
}

test('menu : « Pneumatiques » au même niveau que Stock et Pilotage, hors des onglets du stock', async ({
  page,
}) => {
  await loginAs(page, 'direction@rts.local');
  const side = await sideNav(page);
  // Entrée directe, sans sous-menu à déplier
  await expect(side.getByRole('button', { name: 'Pneumatiques' })).toHaveCount(0);
  await goTo(page, null, 'Pneumatiques');
  await expect(page).toHaveURL(/\/stock\/pneumatiques$/);
  await expect(page.getByRole('heading', { name: 'Pneumatiques' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Catalogues' })).toHaveCount(0);

  // Stock : consommables, pièces et forfaits seulement
  await goTo(page, 'Stock', 'Pièces');
  const tabs = page.getByRole('navigation', { name: 'Catalogues' });
  await expect(tabs.getByRole('link', { name: 'Forfaits' })).toBeVisible();
  await expect(tabs.getByRole('link', { name: 'Pneumatiques' })).toHaveCount(0);
});
