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

/** PDF minimal (une page vide) : la carte grise scannée envoyée telle quelle. */
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);

test('flotte : carte grise en PDF envoyée puis lue, champs remplis', async ({ page }, testInfo) => {
  const plate = `GP-${String(Date.now()).slice(-3)}-${testInfo.project.name.includes('mobile') ? 'MB' : 'DK'}`;
  // Lecture par l'assistant simulée (Edge Function label-read) : on vérifie que le PDF lui est confié
  const asked: Record<string, unknown>[] = [];
  await page.route('**/functions/v1/label-read', async (route) => {
    asked.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      json: {
        plate,
        brand: 'IVECO',
        model: 'DAILY',
        vin: 'ZCFC135A005123456',
        first_registration: '2021-03-15',
        category: null,
        fuel_type: null,
        confidence: 'haute',
      },
    });
  });

  await loginAs(page, 'direction@rts.local');
  await page.goto('/location/flotte/nouveau');
  await page.getByTestId('upload-registration_doc').setInputFiles({
    name: 'carte-grise.pdf',
    mimeType: 'application/pdf',
    buffer: PDF,
  });
  await expect(
    page.getByText('Carte grise lue : vérifie les champs remplis avant d’enregistrer.'),
  ).toBeVisible();
  expect(asked).toEqual([expect.objectContaining({ kind: 'registration_card' })]);
  await expect(page.getByLabel('Immatriculation')).toHaveValue(plate);
  await expect(page.getByLabel('Marque')).toHaveValue('IVECO');
});
