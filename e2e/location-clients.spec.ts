import { expect, test, type Page } from '@playwright/test';

// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';
// PNG 1×1 : photo factice du permis (assez légère pour ne pas être recompressée).
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

async function scan(page: Page, side: 'recto' | 'verso') {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: new RegExp(`(Scanner|Reprendre) le ${side}`) }).click();
  await (await chooser).setFiles({ name: `permis-${side}.png`, mimeType: 'image/png', buffer: PNG });
  await expect(page.getByRole('img', { name: new RegExp(`${side} du permis`, 'i') })).toBeVisible();
}

const uid = (name: string) => `${name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-6)}`;

test('client particulier : identité, permis scanné recto/verso saisi à la main, filtre de la liste', async ({
  page,
}, testInfo) => {
  test.slow();
  const lastName = `Martin${uid(testInfo.project.name)}`;

  await loginAs(page, 'reception@rts.local');
  await page.goto('/clients');
  await page.getByRole('link', { name: 'Nouveau client' }).click();
  await page.getByRole('radio', { name: /Particulier/ }).click();
  await page.getByLabel('Civilité').selectOption('Mme');
  await page.getByLabel('Nom *', { exact: true }).fill(lastName);
  await page.getByLabel('Prénom *').fill('Julie');
  await page.getByLabel('Date de naissance').fill('1991-03-14');
  await page.getByLabel('Téléphone mobile').fill('06 12 34 56 78');

  // Permis : obligatoire pour louer, recto et verso photographiés, champs complétés à la main
  await expect(page.getByText('Obligatoire pour une location.')).toBeVisible();
  await scan(page, 'recto');
  await scan(page, 'verso');
  await page.getByLabel('N° de permis').fill('9103 9520 0123');
  await page.getByLabel('Délivré le').fill('2010-06-22');
  await page.getByLabel('Valable jusqu’au').fill('2033-06-22');
  await page
    .getByRole('group', { name: 'Catégories' })
    .getByRole('button', { name: 'B', exact: true })
    .click();
  await page.getByRole('button', { name: 'Enregistrer' }).click();

  // Fiche : « Prénom Nom », particulier, permis valide
  await expect(page.getByRole('heading', { level: 1 })).toContainText(`Julie ${lastName}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Particulier');
  const license = page.getByRole('region', { name: /Permis de conduire/ });
  await expect(license).toContainText('Valide');
  await expect(license).toContainText('910395200123');
  await expect(license).toContainText('22/06/2033');

  // Permis modifiable à la main (catégorie BE ajoutée)
  await license.getByRole('button', { name: 'Modifier le permis' }).click();
  const dialog = page.getByRole('dialog', { name: 'Permis de conduire' });
  await expect(dialog.getByLabel('Nom *', { exact: true })).toHaveValue(lastName);
  await dialog.getByRole('button', { name: 'BE', exact: true }).click();
  await dialog.getByRole('button', { name: 'Enregistrer le permis' }).click();
  await expect(license).toContainText('B · BE');

  // Liste : filtre Particuliers
  await page.goto('/clients');
  await page
    .getByRole('group', { name: 'Filtrer les clients' })
    .getByRole('button', { name: /Particuliers/ })
    .click();
  await page.getByLabel('Rechercher un client').fill(lastName);
  const row = page.getByRole('table', { name: 'Liste des clients' }).getByRole('row');
  await expect(row.filter({ hasText: `Julie ${lastName}` })).toContainText('Particulier');
});

test('client pro : conducteur ajouté sans scan, à scanner avant de louer', async ({ page }, testInfo) => {
  test.slow();
  const company = `Transports E2E ${uid(testInfo.project.name)}`;

  await loginAs(page, 'reception@rts.local');
  await page.goto('/clients/nouveau');
  await page.getByRole('radio', { name: /Professionnel/ }).click();
  await page.getByLabel('Raison sociale *').fill(company);
  await page.getByLabel('SIREN').fill('123 456 789');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(company);

  const drivers = page.getByRole('region', { name: /Conducteurs/ });
  await drivers.getByRole('button', { name: 'Ajouter un conducteur' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nouveau conducteur' });
  await dialog.getByLabel('Nom *', { exact: true }).fill('MOREAU');
  await dialog.getByLabel('Prénom *').fill('Pascal');
  await dialog.getByLabel('N° de permis').fill('870512300045');
  await dialog.getByRole('button', { name: 'CE', exact: true }).click();
  await dialog.getByRole('button', { name: 'Enregistrer le permis' }).click();

  const driver = drivers.getByRole('listitem').filter({ hasText: 'Pascal MOREAU' });
  await expect(driver).toContainText('Permis 870512300045 · CE');
  await expect(driver).toContainText('À scanner');

  // Scan ajouté ensuite : le permis devient valide
  await driver.getByRole('button', { name: 'Modifier le permis de Pascal MOREAU' }).click();
  await scan(page, 'recto');
  await scan(page, 'verso');
  await page.getByRole('button', { name: 'Enregistrer le permis' }).click();
  await expect(driver).toContainText('Valide');
});
