import { expect, test, type Page } from '@playwright/test';
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

test('pneus multi-positions entrés sans indice de charge, ligne au profil multi-positions', async ({
  page,
}, testInfo) => {
  // Taille propre à chaque essai et à chaque navigateur (les tests tournent en parallèle)
  const width = 100 + (Date.now() % 900);
  const ratio = testInfo.project.name.includes('mobile') ? '45' : '50';
  const size = `${width}/${ratio} R22.5`;
  const label = `${size} multi-positions`;

  await loginAs(page, 'reception@rts.local');
  await goTo(page, null, 'Pneumatiques');
  await page.getByRole('button', { name: 'Entrée de pneus' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Dimension').fill(`${width}${ratio}225`);
  await dialog.getByLabel('Marque').fill('Michelin');
  await dialog.getByLabel('Modèle').fill('X Multi');
  await dialog.getByRole('button', { name: 'Multi-positions' }).click();
  await expect(dialog.getByLabel('Indices charge / vitesse')).toHaveValue('');
  await expect(dialog.getByText('Facultatif')).toBeVisible();
  await dialog.getByLabel('Quantité').fill('2');
  await dialog.getByLabel('Prix d’achat HT (€)').fill('300');
  await dialog.getByRole('button', { name: 'Ajouter au stock' }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`Michelin X Multi · ${size}`) })).toBeVisible();

  await page.getByRole('link', { name: 'Retour au stock des pneus' }).click();
  await page.getByRole('group', { name: 'Profil' }).getByRole('button', { name: 'Multi-positions' }).click();
  await page.getByRole('searchbox', { name: 'Rechercher une taille' }).fill(`${width}${ratio}`);
  await expect(page.getByRole('row', { name: label })).toContainText('Michelin 2');
});
