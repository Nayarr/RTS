import { expect, test, type Page } from '@playwright/test';
import { goTo, sideNav } from './support/nav';

// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';

async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

/** Connexion réussie : attend l'arrivée dans l'appli avant de naviguer ailleurs. */
async function loginAs(page: Page, email: string, password = PASSWORD) {
  await login(page, email, password);
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
}

async function logout(page: Page) {
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page).toHaveURL(/\/connexion$/);
}

test('seule la direction accède à l’écran Équipe', async ({ page }) => {
  await loginAs(page, 'reception@rts.local');
  await expect((await sideNav(page)).getByRole('button', { name: 'Équipe' })).toHaveCount(0);

  await page.goto('/equipe');
  await expect(page.getByRole('heading', { name: 'Accès refusé' })).toBeVisible();
});

test('la direction crée un technicien, qui se connecte, puis le désactive', async ({ page }, testInfo) => {
  // Nom et e-mail uniques : les projets desktop et mobile tournent en parallèle sur la même base.
  const suffix = `${testInfo.project.name.replace(/\W+/g, '-')}-${Date.now()}`;
  const email = `tech-${suffix}@rts.local`;
  const fullName = `Samir ${suffix}`;
  const temporaryPassword = 'Provisoire-2026';

  await loginAs(page, 'direction@rts.local');
  await goTo(page, 'Équipe', 'Comptes et rôles');
  await expect(page.getByRole('heading', { name: 'Équipe' })).toBeVisible();

  // Création avec mot de passe provisoire
  await page.getByRole('button', { name: 'Nouveau compte' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nouveau compte' });
  await dialog.getByLabel('Nom complet').fill(fullName);
  await dialog.getByLabel('E-mail de connexion').fill(email);
  await expect(dialog.getByLabel('Nom affiché au planning')).toHaveValue('Samir');
  await dialog.getByRole('radio', { name: /Mot de passe provisoire/ }).click();
  await dialog.getByLabel('Mot de passe provisoire').fill(temporaryPassword);
  await dialog.getByRole('button', { name: 'Créer le compte' }).click();

  await expect(page.getByText(`Compte créé pour ${fullName}`)).toBeVisible();
  await expect(dialog).toBeHidden();
  // Tableau (bureau) et cartes (mobile) sont tous deux dans le DOM : on ne garde que la vue affichée.
  await expect(page.getByText(email).filter({ visible: true })).toBeVisible();

  // Le nouveau technicien se connecte
  await logout(page);
  await loginAs(page, email, temporaryPassword);
  await expect(page.getByText('Espace Technicien')).toBeVisible();
  await logout(page);

  // La direction le désactive
  await loginAs(page, 'direction@rts.local');
  await page.goto('/equipe');
  await page.getByRole('button', { name: `Actions pour ${fullName}` }).click();
  await page.getByRole('menuitem', { name: 'Désactiver le compte' }).click();
  await page.getByRole('button', { name: 'Désactiver', exact: true }).click();
  await expect(page.getByText(`${fullName} désactivé`)).toBeVisible();
  await logout(page);

  // Il ne peut plus se connecter
  await login(page, email, temporaryPassword);
  await expect(page.getByText('Ce compte est désactivé. Contacte la direction.')).toBeVisible();
});

test('un code PIN déjà attribué est refusé', async ({ page }) => {
  await loginAs(page, 'direction@rts.local');
  await page.goto('/equipe');

  const setPin = async (name: string, pin: string) => {
    await page.getByRole('button', { name: `Actions pour ${name}` }).click();
    await page.getByRole('menuitem', { name: 'Code PIN de pointage' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Nouveau code').fill(pin);
    await dialog.getByLabel('Confirmation').fill(pin);
    await dialog.getByRole('button', { name: 'Enregistrer' }).click();
    return dialog;
  };

  // Code propre à chaque projet (desktop / mobile) pour que les exécutions parallèles n'interfèrent pas.
  const pin = test.info().project.name.includes('mobile') ? '861357' : '975312';
  await setPin('Alice Martin', pin);
  await expect(page.getByText('Code PIN enregistré')).toBeVisible();

  const dialog = await setPin('Bruno Petit', pin);
  await expect(page.getByText('Ce code est déjà utilisé par un autre technicien')).toBeVisible();
  await expect(dialog).toBeVisible();
});
