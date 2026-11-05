import { expect, test, type Page, type TestInfo } from '@playwright/test';

// Compte de développement créé par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();
}

const suffix = (testInfo: TestInfo) =>
  `${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-6)}`;

test('devis créé sans OR : pièce hors de la base sans prix puis complétée, autre vendue sous son prix d’achat', async ({
  page,
}, testInfo) => {
  const id = suffix(testInfo);
  const designation = `Durite hors base ${id}`;
  await loginAs(page, 'reception@rts.local');

  // Devis créé à l'écran, sans OR, pour un nouveau client
  await page.goto('/devis/nouveau');
  await page.getByLabel(/^Client/).fill(`Client devis ${id}`);
  await page.getByRole('button', { name: 'Créer le devis' }).click();
  await page.getByLabel('Téléphone *').fill('0612345678');
  await page.getByLabel('E-mail *').fill(`devis-${id.toLowerCase()}@exemple.fr`);
  await page.getByLabel(/^Adresse/).fill('12 rue des Transporteurs, 95190 Goussainville');
  const siret = page.getByLabel(/SIRET/);
  if (await siret.count()) await siret.fill('98498913700018');
  await page.getByRole('button', { name: 'Créer le devis' }).click();
  await expect(page).toHaveURL(/\/devis\/[0-9a-f-]{36}$/);

  // Pièce inconnue, seule la désignation est connue
  await page.getByRole('button', { name: 'Ajouter une pièce' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Ajouter une pièce' });
  await dialog.getByLabel('Désignation').fill(designation);
  await dialog.getByRole('button', { name: 'Ajouter la pièce' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: `Modifier la fiche de ${designation}` })).toBeVisible();

  // Prix complété sur la ligne : compté dans le total
  const price = page.getByRole('textbox', { name: 'Prix unit. HT' }).last();
  await price.fill('45');
  await price.press('Tab');
  await expect(page.getByLabel('Totaux')).toContainText(/Total HT\s*45,00\s€/);

  // Pièce vendue sous son prix d'achat : acceptée, prix saisi gardé
  const below = `Joint sous le prix ${id}`;
  await page.getByRole('button', { name: 'Ajouter une pièce' }).first().click();
  await dialog.getByLabel('Désignation').fill(below);
  await dialog.getByLabel('Prix d’achat HT (€)').fill('50');
  await dialog.getByLabel('Prix de vente HT (€)').fill('30');
  await dialog.getByRole('button', { name: 'Ajouter la pièce' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: `Modifier la fiche de ${below}` })).toBeVisible();
  await expect(page.getByLabel('Totaux')).toContainText(/Total HT\s*75,00\s€/);
});
