import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { goTo } from './support/nav';

const PASSWORD = 'atelier-dev-2026';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
}

/** Plaque unique par projet et par exécution (desktop et mobile tournent en parallèle sur la même base). */
const uniquePlate = (testInfo: TestInfo) =>
  `W${String(Date.now()).slice(-8)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;

async function drawSignature(page: Page) {
  const pad = page.getByRole('img', { name: 'Zone de signature du client' });
  await pad.scrollIntoViewIfNeeded();
  const box = await pad.boundingBox();
  if (!box) throw new Error('Zone de signature introuvable');
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  for (let step = 1; step <= 10; step++) {
    await page.mouse.move(box.x + 20 + step * 20, box.y + box.height / 2 + (step % 2 ? -25 : 25));
  }
  await page.mouse.up();
}

async function createRepairOrder(page: Page, plate: string, { signature = false } = {}) {
  await page.goto('/or/nouveau');
  await page.getByLabel('Immatriculation').fill(plate);
  await page.getByLabel('Client', { exact: true }).fill('Transports E2E');
  await page.getByLabel('Tâche à faire').fill('Bruit au freinage + vidange');
  await page.getByLabel('Kilométrage (optionnel)').fill('184320');
  await page.getByRole('combobox', { name: 'Assigner à' }).click();
  await page.getByRole('option', { name: 'Alice' }).click();
  if (signature) await drawSignature(page);
  await page.getByRole('button', { name: 'Créer l’OR' }).click();
}

test('la réception crée un OR signé, visible dans la liste', async ({ page }, testInfo) => {
  const plate = uniquePlate(testInfo);
  await loginAs(page, 'reception@rts.local');
  await goTo(page, 'Atelier', 'Ordres de réparation');
  await page.getByRole('link', { name: 'Nouvel OR' }).click();
  await expect(page).toHaveURL(/\/or\/nouveau$/);

  await createRepairOrder(page, plate, { signature: true });

  // Fiche de l'OR : numéro, technicien, signature envoyée dans le stockage, historique
  await expect(page.getByRole('link', { name: plate, exact: true })).toBeVisible();
  await expect(page.getByText(/^OR\d{5}$/).first()).toBeVisible();
  await expect(page.getByText('Technicien : Alice')).toBeVisible();
  const signature = page.getByRole('img', { name: 'Signature du client', exact: true });
  await expect(signature).toHaveAttribute('src', /X-Amz-Signature=/);
  await expect(page.getByText(/^OR créé : OR\d{5}/)).toBeVisible();

  // Liste : l'OR apparaît et se retrouve par la recherche
  await page.goto('/or');
  await page.getByRole('searchbox', { name: 'Rechercher un OR' }).fill(plate.toLowerCase());
  await expect(page.getByText(plate, { exact: true })).toBeVisible();
});

test('un second OR sur le même véhicule demande confirmation', async ({ page }, testInfo) => {
  const plate = uniquePlate(testInfo);
  await loginAs(page, 'reception@rts.local');
  await createRepairOrder(page, plate);
  await expect(page.getByRole('link', { name: plate, exact: true })).toBeVisible();
  const firstUrl = page.url();

  await page.goto('/or/nouveau');
  await page.getByLabel('Immatriculation').fill(plate);
  await expect(
    page.getByText(/OR non facturé déjà ouvert pour ce véhicule : OR\d{5} \(Assigné\)/),
  ).toBeVisible();
  await expect(page.getByLabel('Client', { exact: true })).toHaveValue('Transports E2E'); // repris du véhicule
  await page.getByLabel('Tâche à faire').fill('Pneus');
  await page.getByRole('button', { name: 'Créer l’OR' }).click();

  const dialog = page.getByRole('dialog', { name: 'Créer un autre OR pour ce véhicule ?' });
  await dialog.getByRole('button', { name: 'Créer quand même' }).click();
  await expect(page.getByRole('link', { name: plate, exact: true })).toBeVisible();
  await expect(page.getByText('Pneus', { exact: true })).toBeVisible();
  expect(page.url()).not.toBe(firstUrl);
});

test('un technicien n’accède pas à la gestion des OR du bureau', async ({ page }) => {
  await loginAs(page, 'alice@rts.local');
  await expect(page.getByRole('link', { name: 'Ordres de réparation' })).toHaveCount(0);
  await page.goto('/or/nouveau');
  await expect(page.getByRole('heading', { name: 'Accès refusé' })).toBeVisible();
});

test('la direction valide un OR terminé puis le supprime', async ({ page }, testInfo) => {
  const plate = uniquePlate(testInfo);
  await loginAs(page, 'direction@rts.local');
  await createRepairOrder(page, plate);
  await expect(page.getByRole('link', { name: plate, exact: true })).toBeVisible();

  // Statut « Terminé atelier » (normalement posé par le technicien), puis validation
  await page.getByRole('combobox', { name: 'Statut' }).click();
  await page.getByRole('option', { name: 'Terminé atelier' }).click();
  // Enregistré tout seul, sans bouton
  await expect(page.getByRole('status').filter({ hasText: 'Enregistré' })).toBeVisible();

  await page.getByRole('button', { name: /Valider → Facture à faire/ }).click();
  await expect(page.getByText('OR validé : facture à faire')).toBeVisible();
  await expect(page.getByText('Statut : Terminé atelier → Facture à faire')).toBeVisible();

  await page.getByRole('button', { name: /Supprimer cet OR/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer', exact: true }).click();
  await expect(page).toHaveURL(/\/or$/);
  await page.getByRole('searchbox', { name: 'Rechercher un OR' }).fill(plate);
  await expect(page.getByText('Aucun ordre de réparation ne correspond.')).toBeVisible();
});
