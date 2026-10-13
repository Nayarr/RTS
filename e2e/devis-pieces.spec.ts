import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'atelier-dev-2026';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
}

const uid = (project: string) => `${String(Date.now()).slice(-7)}${project.includes('mobile') ? 'M' : 'D'}`;

test('pièce saisie sur le devis avec sa marge, gardée dans la base ; prestation offerte', async ({
  page,
}, testInfo) => {
  test.slow(); // deux comptes successifs, PDF généré
  const id = uid(testInfo.project.name);
  const part = `Courroie alternateur ${id}`;
  const ref = `CA-${id}`;

  await loginAs(page, 'reception@rts.local');
  await page.goto('/devis/nouveau');
  await page.getByLabel('Client').fill('Transports E2E');
  await page.getByRole('button', { name: 'Créer le devis' }).click();
  await expect(page.getByRole('heading', { name: 'DEVIS', exact: true, level: 2 })).toBeVisible();
  const totals = page.getByLabel('Totaux');

  // Pièce saisie directement : prix de vente calculé depuis l'achat, le port et la marge
  await page.getByRole('button', { name: 'Ajouter une pièce' }).click();
  const dialog = page.getByRole('dialog', { name: 'Ajouter une pièce' });
  await dialog.getByLabel('Désignation').fill(part);
  await dialog.getByLabel('Référence véhicule').fill('Volvo FH 500');
  await dialog.getByLabel('Référence pièce').fill(ref);
  await dialog.getByLabel('Prix d’achat HT (€)').fill('40');
  await dialog.getByLabel('Frais de port HT (€)').fill('10');
  await dialog.getByLabel('Marge (%)').fill('20');
  await expect(dialog.getByLabel('Prix de vente HT calculé')).toHaveText('60,00 €');
  await dialog.getByRole('button', { name: 'Ajouter la pièce' }).click();
  await expect(dialog).toBeHidden();
  await expect(totals).toContainText('60,00 €');

  // Proposée ensuite par la base
  await page.getByRole('button', { name: 'Ajouter une pièce' }).click();
  await dialog.getByLabel('Désignation').fill(ref);
  await expect(dialog.getByRole('list', { name: 'Pièces de la base' })).toContainText(part);
  await dialog.getByRole('button', { name: 'Annuler' }).click();

  // Geste commercial : main d'œuvre offerte
  await page.getByRole('button', { name: 'Ajouter de la main d’œuvre' }).click();
  const labor = page.getByRole('dialog', { name: 'Main d’œuvre' });
  await labor.getByLabel('Prestation').fill('Contrôle hayon');
  await labor.getByLabel('Temps (heures)').fill('1');
  await labor.getByRole('button', { name: 'Ajouter' }).click();
  await page.getByRole('button', { name: 'Offrir Contrôle hayon' }).click();
  await expect(page.getByText('Offert à titre commercial')).toBeVisible();
  await expect(totals).toContainText('Dont offert');
  await expect(totals).toContainText('90,00 €');
  await expect(totals).toContainText('72,00 €'); // 60 € HT + TVA, la main d'œuvre offerte est à 0

  // PDF du devis
  await page.getByRole('button', { name: 'Générer le PDF' }).click();
  const preview = page.getByRole('dialog', { name: 'Aperçu' });
  await expect(preview.getByText(/^Devis_DV\d{5}\.pdf$/)).toBeVisible();
  await preview.getByRole('button', { name: 'Fermer' }).click();

  // La direction retrouve la pièce et sa marge dans la page Pièces
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page.getByLabel('E-mail')).toBeVisible();
  await loginAs(page, 'direction@rts.local');
  await page.goto('/stock/pieces');
  await page.getByRole('searchbox', { name: 'Rechercher une pièce' }).fill(ref);
  const row = page.getByRole('row', { name: part });
  await expect(row).toContainText('Volvo FH 500');
  await expect(row).toContainText('20 %');
  await expect(row).toContainText('Sur 1 devis');
});

test('SIRET contrôlé sur la fiche client (14 chiffres et clé)', async ({ page }, testInfo) => {
  await loginAs(page, 'reception@rts.local');
  await page.goto('/clients/nouveau');
  await page.getByRole('radio', { name: /Professionnel/ }).click();
  await page.getByLabel('Raison sociale *').fill(`Transports SIRET ${uid(testInfo.project.name)}`);
  await page.getByLabel('SIRET').fill('123 456 789');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('SIRET à 14 chiffres')).toBeVisible();
  await page.getByLabel('SIRET').fill('123 456 789 00016');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('SIRET invalide : vérifie les chiffres')).toBeVisible();
  await page.getByLabel('SIRET').fill('123 456 789 00015');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Transports SIRET');
  await expect(page.getByLabel('SIRET')).toHaveValue('123 456 789 00015');
});
