import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'atelier-dev-2026';
// PNG 1×1 transparent.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
}

test('seule la direction accède aux réglages', async ({ page }) => {
  await loginAs(page, 'reception@rts.local');
  await expect(page.getByRole('link', { name: 'Réglages' })).toHaveCount(0);
  await page.goto('/reglages');
  await expect(page.getByRole('heading', { name: 'Accès refusé' })).toBeVisible();
});

test('la direction modifie les coordonnées, conservées après rechargement', async ({ page }, testInfo) => {
  // Champ différent par projet : desktop et mobile tournent en parallèle sur la même base.
  const field = testInfo.project.name.includes('mobile') ? 'Téléphone' : 'Capital social';
  const value = `Test ${Date.now()}`;

  await loginAs(page, 'direction@rts.local');
  await page.getByRole('link', { name: 'Réglages' }).click();
  await expect(page.getByRole('heading', { name: 'Réglages', level: 1 })).toBeVisible();

  const save = page.getByRole('button', { name: 'Enregistrer' });
  await expect(save).toBeDisabled();
  await page.getByLabel(field).fill(value);
  await save.click();
  await expect(page.getByText('Coordonnées enregistrées')).toBeVisible();

  await page.reload();
  await expect(page.getByLabel(field)).toHaveValue(value);
});

test('une saisie invalide est signalée et rien n’est enregistré', async ({ page }) => {
  await loginAs(page, 'direction@rts.local');
  await page.goto('/reglages');
  await page.getByRole('tab', { name: 'Atelier' }).click();
  await page.getByLabel('Fin de pause').fill('12:00');
  await page.getByRole('button', { name: 'Enregistrer' }).click();

  await expect(page.getByText('La pause doit finir après son début')).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: 'Atelier' }).click();
  await expect(page.getByLabel('Fin de pause')).toHaveValue('14:00');
});

test('le logo est envoyé dans le stockage et affiché', async ({ page }) => {
  await loginAs(page, 'direction@rts.local');
  await page.goto('/reglages');
  await page
    .getByTestId('upload-logo')
    .setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });

  await expect(page.getByText('Logo enregistré')).toBeVisible();
  const logo = page.getByRole('img', { name: 'Logo de l’entreprise', exact: true });
  await expect(logo).toHaveAttribute('src', /X-Amz-Signature=/);
  await expect(logo).toHaveJSProperty('complete', true);
  expect(await logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
});
