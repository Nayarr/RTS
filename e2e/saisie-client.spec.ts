import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { fillNewProClient } from './support/new-client';

const PASSWORD = 'atelier-dev-2026';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();
}

const suffix = (testInfo: TestInfo) =>
  `${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-7)}`;

test('nouveau rendez-vous : client inconnu, fiche exigée puis client créé avec ses coordonnées', async ({
  page,
}, testInfo) => {
  const id = suffix(testInfo);
  const clientName = `Client fiche ${id}`;
  await loginAs(page, 'reception@rts.local');
  await page.goto('/rendez-vous');
  await page.getByRole('button', { name: 'Nouveau rendez-vous' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Nouveau rendez-vous' });

  // Client existant : proposé pendant la frappe, pas de fiche à remplir
  await dialog.getByLabel('Client', { exact: true }).fill('Transports E2');
  await dialog.getByRole('option', { name: 'Transports E2E', exact: true }).click();
  await expect(dialog.getByLabel('Client', { exact: true })).toHaveValue('Transports E2E');
  await page.waitForTimeout(800);
  await expect(dialog.getByText('Nouveau client : fiche à compléter', { exact: true })).toBeHidden();

  // Client inconnu : l'enregistrement attend la fiche complète
  await dialog.getByLabel('Client', { exact: true }).fill(clientName);
  await dialog.getByLabel('Motif').fill('Vidange');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  // Pas encore vérifié pendant la frappe : la fiche s'ouvre, rien n'est enregistré
  await expect(dialog.getByText('Nouveau client : fiche à compléter', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog.getByText('Indique le SIRET')).toBeVisible();

  await fillNewProClient(dialog, `rdv-${id.toLowerCase()}@client-e2e.fr`);
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog).toBeHidden();

  await page.goto('/clients');
  await page.getByRole('searchbox', { name: 'Rechercher un client' }).fill(clientName);
  await page
    .getByRole('link', { name: `Ouvrir la fiche de ${clientName}` })
    .first()
    .click();
  await expect(page.getByRole('textbox', { name: 'E-mail', exact: true })).toHaveValue(
    `rdv-${id.toLowerCase()}@client-e2e.fr`,
  );
});

test('nouvelle location : client créé depuis la location et choisi aussitôt', async ({ page }, testInfo) => {
  const id = suffix(testInfo);
  await loginAs(page, 'reception@rts.local');
  await page.goto('/location/nouvelle');
  await page.getByRole('searchbox', { name: 'Rechercher un client' }).fill(`Martin ${id}`);
  await page.getByRole('button', { name: 'Créer ce client' }).click();

  await page.getByRole('button', { name: 'Particulier' }).click();
  await page.getByLabel('Civilité *').selectOption('M.');
  await page.getByLabel('Nom *', { exact: true }).fill(`Martin${id}`);
  await page.getByLabel('Prénom *').fill('Paul');
  await page.getByLabel('Téléphone *').fill('0698765432');
  await page.getByLabel('E-mail *').fill(`loc-${id.toLowerCase()}@client-e2e.fr`);
  await page.getByLabel('Adresse *').fill('2 avenue de la Gare 95190 Goussainville');
  await page.getByRole('button', { name: 'Créer le client' }).click();

  await expect(page.getByText('Client créé')).toBeVisible();
  const chosen = page.getByRole('region', { name: 'Client' });
  await expect(chosen.getByText(`Paul Martin${id}`)).toBeVisible();
  await expect(chosen.getByText('Particulier')).toBeVisible();
  await expect(chosen.getByRole('button', { name: 'Changer' })).toBeVisible();
});
