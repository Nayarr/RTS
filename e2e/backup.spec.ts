import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'atelier-dev-2026';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
}

test('la direction télécharge la sauvegarde complète de la base', async ({ page }) => {
  await loginAs(page, 'direction@rts.local');
  await page.goto('/reglages?onglet=sauvegarde');
  await expect(page.getByRole('tab', { name: 'Sauvegarde' })).toHaveAttribute('aria-selected', 'true');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Télécharger la sauvegarde' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^sauvegarde_rts_atelier_\d{4}-\d{2}-\d{2}\.json$/);

  const backup = JSON.parse(await readFile(await file.path(), 'utf-8')) as {
    app: string;
    tables: Record<string, unknown[]>;
  };
  expect(backup.app).toBe('RTS Atelier');
  expect(backup.tables.profiles?.length).toBeGreaterThan(0);
  expect(backup.tables).toHaveProperty('clients');
  expect(backup.tables).not.toHaveProperty('technician_pins');

  await expect(page.getByText(/Sauvegarde téléchargée \(.+ lignes\)/)).toBeVisible();
  await expect(page.getByText(/^Dernière sauvegarde aujourd’hui/)).toBeVisible();
});
