import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Client pas encore en base : sa fiche s'affiche sous le nom saisi (OR, rendez-vous, devis,
 * contrat). Remplie ici comme un client professionnel.
 */
export async function fillNewProClient(scope: Page | Locator, email = 'contact@client-e2e.fr') {
  await expect(scope.getByText('Nouveau client : fiche à compléter', { exact: true })).toBeVisible();
  await scope.getByLabel('SIRET *').fill('98498913700018');
  await scope.getByLabel('Téléphone *').fill('0612345678');
  await scope.getByLabel('E-mail *').fill(email);
  await scope.getByLabel('Adresse de facturation *').fill('1 rue de l’Industrie 95190 Goussainville');
}
