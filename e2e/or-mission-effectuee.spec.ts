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

async function logout(page: Page) {
  await page.getByRole('button', { name: 'Se déconnecter' }).first().click();
  await expect(page).toHaveURL(/\/connexion$/);
}

test('mission de l’OR : chaque ligne dans les travaux effectués du technicien, qui donne son temps', async ({
  page,
}, testInfo) => {
  test.slow();
  const plate = `MI${String(Date.now()).slice(-7)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;

  // Bureau : OR créé avec deux tâches
  await loginAs(page, 'reception@rts.local');
  await page.goto('/or/nouveau');
  await page.getByLabel('Immatriculation').fill(plate);
  await page.getByLabel('Client', { exact: true }).fill('Transports E2E');
  await page.getByLabel('Tâche à faire').fill('Contrôle complet\nVidange moteur');
  await expect(page.getByText(/chacune arrive dans les travaux effectués du technicien/)).toBeVisible();
  await page.getByRole('combobox', { name: 'Assigner à' }).click();
  await page.getByRole('option', { name: 'Alice' }).click();
  await page.getByRole('button', { name: 'Créer l’OR' }).click();
  await expect(page.getByRole('link', { name: plate, exact: true })).toBeVisible();
  const orderPath = new URL(page.url()).pathname;
  const lines = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole('heading', { name: 'Intervention atelier' }) });
  await expect(lines.getByText('Contrôle complet', { exact: true })).toBeVisible();
  await expect(lines.getByText('Vidange moteur', { exact: true })).toBeVisible();
  await logout(page);

  // Technicien : les deux tâches sont déjà dans ses travaux effectués, temps à donner
  await loginAs(page, 'alice@rts.local');
  await page.goto(`/atelier${orderPath}`);
  await expect(page.getByRole('heading', { name: plate, level: 1 })).toBeVisible();
  const done = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole('heading', { name: 'Travaux effectués' }) });
  const tasks = done.getByRole('textbox', { name: 'Description de la tâche' });
  await expect(tasks).toHaveCount(2);
  await expect(tasks.first()).toHaveValue('Contrôle complet');
  await expect(tasks.last()).toHaveValue('Vidange moteur');
  const times = done.getByRole('combobox', { name: 'Temps estimé' });
  await expect(times.first()).toHaveValue('');
  await times.first().selectOption('1h');
  await expect(times.first()).toHaveValue('1h');

  // Clôture : la tâche sans temps est signalée
  await page.getByRole('group', { name: 'Devis nécessaire ?' }).getByRole('button', { name: 'NON' }).click();
  await expect(page.getByRole('status', { name: 'À compléter avant de terminer' })).toContainText(
    'Temps estimé manquant : 1 tâche des travaux effectués',
  );
});
