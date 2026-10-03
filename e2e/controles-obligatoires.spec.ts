import { expect, test, type Page } from '@playwright/test';

// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();
}

const TOGGLE = 'Fiche de contrôle complète obligatoire';

test('fiche de contrôle complète : posée par la direction, exigée chez le technicien', async ({
  page,
  browser,
}, testInfo) => {
  const plate = `CO${String(Date.now()).slice(-7)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;

  // Réception : pas d'interrupteur
  await loginAs(page, 'reception@rts.local');
  await page.goto('/or/nouveau');
  await expect(page.getByLabel('Immatriculation')).toBeVisible();
  await expect(page.getByRole('switch', { name: TOGGLE })).toHaveCount(0);

  // Direction : OR créé avec la fiche complète exigée
  const office = await browser.newContext();
  const direction = await office.newPage();
  await loginAs(direction, 'direction@rts.local');
  await direction.goto('/or/nouveau');
  await direction.getByLabel('Immatriculation').fill(plate);
  await direction.getByLabel('Client', { exact: true }).fill('Transports E2E');
  await direction.getByLabel('Tâche à faire').fill('Contrôle complet');
  await direction.getByRole('combobox', { name: 'Assigner à' }).click();
  await direction.getByRole('option', { name: 'Alice' }).click();
  await direction.getByRole('switch', { name: TOGGLE }).click();
  await expect(direction.getByRole('switch', { name: TOGGLE })).toBeChecked();
  await direction.getByRole('button', { name: 'Créer l’OR' }).click();
  await expect(direction.getByRole('link', { name: plate, exact: true })).toBeVisible();
  await expect(direction.getByText('Fiche complète exigée')).toBeVisible();
  const orderPath = new URL(direction.url()).pathname;
  await office.close();

  // Technicien : rappel sur la fiche et clôture bloquée tant que tout n'est pas renseigné
  const workshop = await browser.newContext();
  const tech = await workshop.newPage();
  await loginAs(tech, 'alice@rts.local');
  await tech.goto(`/atelier${orderPath}`);
  await expect(tech.getByText(/Fiche complète exigée par la direction : 15 points/)).toBeVisible();
  await tech.getByRole('group', { name: 'Devis nécessaire ?' }).getByRole('button', { name: 'NON' }).click();
  await expect(tech.getByRole('status', { name: 'À compléter avant de terminer' })).toContainText(
    'Fiche de contrôle complète exigée : 15 points OK / 50 % / HS non renseignés',
  );
  await expect(tech.getByRole('button', { name: 'Travaux terminés' })).toBeDisabled();
  await workshop.close();
});
