import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
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

/** Jour passé propre à ce passage (une période ne s'archive qu'une fois, la base sert à plusieurs passages). */
function pastDay() {
  const day = new Date(Date.UTC(2001, 0, 1) + Math.floor(Math.random() * 7000) * 86_400_000);
  return day.toISOString().slice(0, 10);
}

test('direction : journal vérifié, archive d’une période créée et téléchargée avec son empreinte', async ({
  page,
}) => {
  test.slow();
  await loginAs(page, 'direction@rts.local');
  await page.goto('/reglages?onglet=conformite');

  // Résultat de la vérification (la base sert aussi aux e2e qui antidatent des factures en direct :
  // le journal les signale, l'intégrité elle-même est couverte par le pgTAP 158)
  await page.getByRole('button', { name: 'Vérifier le journal' }).click();
  await expect(page.getByRole('status')).toContainText(/Journal intègre|Anomalies détectées/);
  await expect(page.getByRole('status')).toContainText(/Dernière empreinte : [0-9a-f]{64}/);

  const day = pastDay();
  const [year, month, date] = day.split('-');
  await page.getByLabel('Du', { exact: true }).fill(day);
  await page.getByLabel('Au', { exact: true }).fill(day);
  await page.getByRole('button', { name: 'Archiver la période' }).click();
  await expect(page.getByText('Archive créée')).toBeVisible();

  const label = `${date}/${month}/${year}`;
  const item = page
    .getByRole('list', { name: 'Archives fiscales' })
    .getByRole('listitem')
    .filter({ hasText: `Du ${label} au ${label}` });
  await expect(item).toContainText('à la demande');
  const sha = (await item.getByText(/^SHA-256 /).innerText()).replace('SHA-256 ', '').trim();
  expect(sha).toMatch(/^[0-9a-f]{64}$/);

  const download = page.waitForEvent('download');
  await item.getByRole('button', { name: `Télécharger l’archive du ${label} au ${label}` }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(`archive-fiscale-rts-${day}-au-${day}.json`);
  const content = await readFile(await file.path());
  expect(createHash('sha256').update(content).digest('hex')).toBe(sha);
  expect(JSON.parse(content.toString('utf8'))).toMatchObject({
    format: 'rts-archive-fiscale/1',
    periode: { du: day, au: day },
  });

  // Même période une seconde fois : refusée
  await page.getByRole('button', { name: 'Archiver la période' }).click();
  await expect(page.getByText('Cette période est déjà archivée')).toBeVisible();
});
