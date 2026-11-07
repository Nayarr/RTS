import { expect, test } from '@playwright/test';

// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';

test('forfait saisi en majuscules : enregistré en minuscules, sigles gardés', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Saisie des forfaits : poste du bureau');
  const ref = String(Date.now()).slice(-6);
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill('direction@rts.local');
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();

  await page.goto('/stock/forfaits');
  await page.getByRole('button', { name: 'Nouveau forfait' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nouveau forfait' });
  await expect(dialog.getByText(/les sigles \(PL, AR, CT, HP…\) restent en majuscules/)).toBeVisible();
  await dialog.getByLabel('Nom du forfait').fill(`FORFAIT REMPLACEMENT PLAQUETTE AR PL ${ref}`);
  await dialog.getByLabel('Temps barème (heures)').fill('1');
  await dialog.getByLabel('Prix forfaitaire HT (€)').fill('150');
  await dialog.getByRole('button', { name: 'Ajouter le forfait' }).click();
  await expect(dialog).toBeHidden();

  await expect(
    page.getByRole('article', { name: `Forfait remplacement plaquette AR PL ${ref}` }),
  ).toBeVisible();
  await expect(page.getByText(`FORFAIT REMPLACEMENT PLAQUETTE AR PL ${ref}`, { exact: true })).toHaveCount(0);
});
