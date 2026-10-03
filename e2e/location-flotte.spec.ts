import { expect, test, type Page } from '@playwright/test';
import { parisDay } from './support/dates';

// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';
// PNG 1×1 : document factice (assez léger pour ne pas être recompressé).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();
}

const frDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

test('flotte de location : ajout d’un véhicule, bloqué tant que l’assurance est expirée, boîte à gants, échéances', async ({
  page,
}, testInfo) => {
  test.slow();
  const id = `${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-5)}`;
  const plate = `FL-${id}`;
  const expired = parisDay(-5);

  await loginAs(page, 'reception@rts.local');
  await page.goto('/location/flotte/nouveau');
  await page.getByRole('radio', { name: /Utilitaire/ }).click();
  await page.getByLabel('Immatriculation').fill(plate.toLowerCase());
  await page.getByLabel('Marque').fill('Renault');
  await page.getByLabel('Modèle').fill('Master 20 m³');
  await page.getByLabel('Kilométrage actuel').fill('48210');
  await page.getByLabel('Prix par jour (€)').fill('95');
  await page.getByLabel('Caution (€)').fill('1500');
  await page.getByLabel('Contrôle technique').fill(parisDay(15));
  await page.getByLabel('Fin d’assurance').fill(expired);
  await page.getByLabel('Prochaine vidange (km)').fill('50000');
  await page.getByRole('button', { name: 'Enregistrer' }).click();

  // Fiche : plaque en majuscules, location bloquée par l'assurance expirée
  await expect(page.getByRole('heading', { name: new RegExp(plate) })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Assurance expirée' })).toHaveText(
    `Assurance expirée le ${frDate(expired)} : le véhicule ne peut être ni loué ni prêté.`,
  );
  const vehicleUrl = page.url();

  // Boîte à gants : attestation ajoutée puis retirée
  const gloveBox = page.getByRole('region', { name: /Boîte à gants/ });
  const chooser = page.waitForEvent('filechooser');
  await gloveBox.getByRole('button', { name: 'Ajouter : Attestation d’assurance' }).click();
  await (await chooser).setFiles({ name: 'assurance.png', mimeType: 'image/png', buffer: PNG });
  await expect(gloveBox.getByRole('button', { name: 'Retirer Attestation d’assurance' })).toBeVisible();
  await expect(gloveBox.getByRole('heading')).toContainText('1');
  await gloveBox.getByRole('button', { name: 'Retirer Attestation d’assurance' }).click();
  await page
    .getByRole('dialog', { name: 'Retirer ce document ?' })
    .getByRole('button', { name: 'Retirer' })
    .click();
  await expect(gloveBox.getByRole('button', { name: 'Ajouter : Attestation d’assurance' })).toBeVisible();

  // Échéances de la flotte : assurance expirée (bloqué), contrôle technique et vidange à venir
  await page.goto('/vehicules/echeances?vue=flotte');
  const rows = page
    .getByRole('table', { name: 'Échéances de la flotte' })
    .getByRole('row')
    .filter({ hasText: plate });
  await expect(rows).toHaveCount(3);
  await expect(rows.filter({ hasText: 'Assurance' })).toContainText('Expirée depuis 5 jours');
  await expect(rows.filter({ hasText: 'Assurance' })).toContainText('Bloqué');
  await expect(rows.filter({ hasText: 'Contrôle technique' })).toContainText('Dans 15 jours');
  await expect(rows.filter({ hasText: 'Vidange' })).toContainText(/Dans 1.790 km/);

  // Assurance renouvelée : le véhicule redevient disponible
  await page.goto(vehicleUrl);
  await page.getByRole('link', { name: 'Modifier' }).first().click();
  await page.getByLabel('Fin d’assurance').fill(parisDay(200));
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('heading', { name: new RegExp(plate) })).toContainText('Disponible');
  await expect(page.getByRole('alert').filter({ hasText: 'Assurance expirée' })).toHaveCount(0);

  // En entretien : bloqué jusqu'à la remise en service
  await page.getByRole('button', { name: 'Mettre en entretien' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Véhicule en entretien' })).toBeVisible();
  await page.getByRole('button', { name: 'Remettre en service' }).click();
  await expect(page.getByRole('heading', { name: new RegExp(plate) })).toContainText('Disponible');

  // Liste de la flotte : recherche par plaque
  await page.goto('/location/flotte');
  await page.getByLabel('Rechercher un véhicule').fill(plate);
  await expect(page.getByRole('link', { name: new RegExp(plate) })).toContainText('Disponible');
});
