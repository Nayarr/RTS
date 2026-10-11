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

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** Jour futur en semaine tiré au hasard : les absences d'un technicien ne se chevauchent pas. */
function randomWeekday() {
  const date = new Date(2031, 0, 1);
  date.setDate(date.getDate() + Math.floor(Math.random() * 3000));
  while (date.getDay() === 0 || date.getDay() === 6) date.setDate(date.getDate() + 1);
  return iso(date);
}

test('absence d’un après-midi : saisie par la direction, en gris dans le planning', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Planning du bureau');
  const day = randomWeekday();
  await loginAs(page, 'direction@rts.local');
  await page.goto('/pointages/conges');
  await page.getByRole('button', { name: 'Ajouter une absence' }).click();
  const dialog = page.getByRole('dialog', { name: 'Ajouter une absence' });
  await dialog.getByLabel('Technicien').selectOption({ label: 'Bruno' });
  await dialog.getByLabel('Type').selectOption({ label: 'Autre absence' });
  await dialog.getByRole('button', { name: 'Après-midi' }).click();
  await dialog.getByLabel('Le', { exact: true }).fill(day);
  await dialog.getByLabel('De', { exact: true }).fill('14:00');
  await dialog.getByLabel('À', { exact: true }).fill('17:00');
  await expect(dialog).toContainText('3 h d’absence');
  await dialog.getByRole('button', { name: 'Enregistrer l’absence' }).click();
  await expect(dialog).toBeHidden();

  // Planning du jour : Bruno présent le matin, bloc gris l'après-midi
  await page.goto(`/planning?vue=jour&date=${day}`);
  await expect(page.getByRole('note', { name: 'Absence de Bruno de 14:00 à 17:00' })).toBeVisible();
});

test('technicien : onglet « Congés » dans la barre du bas', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), 'Appli du technicien');
  await loginAs(page, 'alice@rts.local');
  await page.getByRole('link', { name: 'Congés' }).click();
  await expect(page).toHaveURL(/\/conges$/);
  await expect(page.getByRole('heading', { name: 'Congés', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Demander un congé' })).toBeVisible();
  // L'accueil ne montre plus les congés
  await page.getByRole('link', { name: 'Mes OR' }).click();
  await expect(page.getByRole('button', { name: 'Demander un congé' })).toHaveCount(0);
});
