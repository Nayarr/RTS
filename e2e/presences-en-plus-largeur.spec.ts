import { expect, test } from '@playwright/test';
import { goTo } from './support/nav';

// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';

test('la fiche d’un technicien ne défile pas en largeur, présences en plus comprises', async ({ page }) => {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill('direction@rts.local');
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();

  await goTo(page, 'Équipe', 'Comptes et rôles');
  await page.getByRole('button', { name: 'Actions pour Alice Martin' }).click();
  await page.getByRole('menuitem', { name: 'Modifier' }).click();

  const dialog = page.getByRole('dialog', { name: 'Modifier le compte' });
  const from = dialog.getByLabel('Du', { exact: true });
  await from.scrollIntoViewIfNeeded();
  await expect(from).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Ajouter' })).toBeInViewport();

  // Rien ne dépasse : la fenêtre est aussi large que son contenu, sur ordinateur comme sur téléphone.
  const widths = await dialog.evaluate((element) => ({
    visible: element.clientWidth,
    content: element.scrollWidth,
  }));
  expect(widths.content).toBeLessThanOrEqual(widths.visible);

  await dialog.getByRole('button', { name: 'Annuler' }).click();
  await expect(dialog).toBeHidden();
});
