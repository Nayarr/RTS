import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'atelier-dev-2026';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();
}

/** Jour futur (hors dimanche) tiré au hasard : les congés d'un technicien ne se chevauchent pas. */
function randomFutureDay() {
  const date = new Date(2031, 0, 1);
  date.setDate(date.getDate() + Math.floor(Math.random() * 3000));
  if (date.getDay() === 0) date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

test('congés : dates côte à côte dans la fenêtre, pastille « En attente » centrée', async ({
  page,
  browser,
}, testInfo) => {
  test.slow();
  const comment = `Affichage ${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-6)}`;
  const day = randomFutureDay();

  await loginAs(page, 'alice@rts.local');
  await page.getByRole('link', { name: 'Congés' }).click();
  await page.getByRole('button', { name: 'Demander un congé' }).click();
  const dialog = page.getByRole('dialog', { name: 'Demande de congé' });
  await dialog.getByLabel('Du', { exact: true }).fill(day);
  await dialog.getByLabel('Au (inclus)').fill(day);

  // Les deux champs restent dans la fenêtre sans se chevaucher
  const box = await dialog.boundingBox();
  const from = await dialog.getByLabel('Du', { exact: true }).boundingBox();
  const to = await dialog.getByLabel('Au (inclus)').boundingBox();
  if (!box || !from || !to) throw new Error('Champs de date introuvables');
  expect(from.x + from.width).toBeLessThanOrEqual(to.x);
  expect(to.x + to.width).toBeLessThanOrEqual(box.x + box.width);

  await dialog.getByLabel('Commentaire').fill(comment);
  await dialog.getByRole('button', { name: 'Envoyer la demande' }).click();
  await expect(dialog).toBeHidden();

  const context = await browser.newContext({ ...testInfo.project.use });
  const office = await context.newPage();
  await loginAs(office, 'direction@rts.local');
  await office.goto('/pointages/conges');
  const request = office
    .getByRole('region', { name: /Demandes à traiter/ })
    .getByRole('article')
    .filter({ hasText: comment });
  const badge = request.getByText('En attente', { exact: true });
  await expect(badge).toHaveCSS('display', 'inline-flex');
  await expect(badge).toHaveCSS('align-items', 'center');
  // Pastille à la taille de son texte (pas étirée sur toute la ligne)
  const badgeBox = await badge.boundingBox();
  const articleBox = await request.boundingBox();
  if (!badgeBox || !articleBox) throw new Error('Pastille introuvable');
  expect(badgeBox.width).toBeLessThan(articleBox.width / 2);

  await request.getByRole('button', { name: 'Refuser' }).click();
  await context.close();
});
