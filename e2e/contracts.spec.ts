import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { parisDay } from './support/dates';

const PASSWORD = 'atelier-dev-2026';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
}

const suffix = (testInfo: TestInfo) =>
  `${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-7)}`;

test('contrat d’entretien : entretien planifié, facture du mois, fin du contrat', async ({
  page,
}, testInfo) => {
  test.slow();
  const id = suffix(testInfo);
  const clientName = `Client contrat ${id}`;
  const [plateA, plateB] = [`KA${id}`, `KB${id}`];

  await loginAs(page, 'reception@rts.local');
  await page.goto('/contrats');
  // Bouton de la barre de titre (la liste vide en affiche un second)
  await page.getByRole('button', { name: 'Nouveau contrat' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Nouveau contrat d’entretien' });
  await dialog.getByLabel('Client').fill(clientName);
  await dialog.getByLabel('Prestation').fill('Vidange + contrôle général');
  await dialog.getByLabel(/Véhicules/).fill(`${plateA}, ${plateB}`);
  await dialog.getByLabel('Tous les … mois').fill('6');
  await dialog.getByLabel('Prix mensuel HT').fill('250');
  await dialog.getByLabel('Début du contrat').fill(parisDay(-240));
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog).toBeHidden();

  // Aucun entretien depuis 8 mois : les deux véhicules sont à planifier
  const card = page.getByRole('article', { name: `${clientName} — Vidange + contrôle général` });
  await expect(card.getByRole('button', { name: 'À planifier' })).toHaveCount(2);
  await expect(card).toContainText('2 entretiens à planifier');

  const rowA = card.getByRole('listitem').filter({ hasText: plateA });
  await rowA.getByRole('button', { name: 'À planifier' }).click();
  const appointment = page.getByRole('dialog', { name: 'Nouveau rendez-vous' });
  await expect(appointment.getByLabel('Motif')).toHaveValue('Entretien contrat : Vidange + contrôle général');
  await expect(appointment.getByLabel('Immatriculation')).toHaveValue(plateA);
  await appointment.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(appointment).toBeHidden();
  await expect(rowA).toContainText('RDV planifié');
  await expect(card).toContainText('1 entretien à planifier');

  // Facture du mois : brouillon avec la ligne du contrat
  await card.getByRole('button', { name: 'Facturer le mois' }).click();
  await expect(page).toHaveURL(/\/factures\/[0-9a-f-]{36}$/);
  await expect(page.getByText(/Contrat d.entretien — Vidange \+ contrôle général/).first()).toBeVisible();

  // Fin du contrat : il passe dans les contrats terminés
  await page.goto('/contrats');
  await card.getByRole('button', { name: new RegExp(clientName) }).click();
  await page.getByRole('button', { name: 'Mettre fin au contrat' }).click();
  await page
    .getByRole('dialog', { name: 'Mettre fin à ce contrat ?' })
    .getByRole('button', { name: 'Mettre fin au contrat' })
    .click();
  await expect(card).toHaveCount(0);
  await page.getByRole('button', { name: /Voir les contrats terminés/ }).click();
  await expect(card).toContainText('terminé le');
});

test('le technicien n’a pas accès aux contrats', async ({ page }) => {
  await loginAs(page, 'alice@rts.local');
  await page.goto('/contrats');
  await expect(page.getByRole('heading', { name: 'Accès refusé' })).toBeVisible();
});
