import { expect, test, type Page } from '@playwright/test';
import { parisDay } from './support/dates';

// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();
}

const MONTH_TITLE = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

test('graphique de CA : le survol (ou l’appui) d’une colonne affiche le détail du mois', async ({
  page,
}, testInfo) => {
  await loginAs(page, 'direction@rts.local');
  await page.goto('/pilotage/statistiques');
  const chart = page.getByRole('figure', { name: 'Chiffre d’affaires HT par mois' });
  await expect(chart).toBeVisible();

  // Colonne du mois en cours (la dernière)
  const month = `${parisDay().slice(0, 7)}-01`;
  const column = chart.locator(`[data-bar="${month}"] rect`).first();
  const title = MONTH_TITLE.format(new Date(`${month}T00:00:00Z`));
  const mobile = testInfo.project.name.includes('mobile');
  if (mobile) await column.tap({ force: true });
  else await column.hover({ force: true });

  const tip = page.getByRole('tooltip');
  await expect(tip).toBeVisible();
  await expect(tip).toContainText(new RegExp(title, 'i'));
  for (const label of ['Main d’œuvre / forfaits', 'Pièces', 'Marge pièces', 'Total HT']) {
    await expect(tip).toContainText(label);
  }
  await expect(tip).toContainText(/\d\s€/);
  // Montant total identique à celui du tableau (ligne du mois en cours, dernière colonne)
  const total = await page.getByRole('row').nth(1).getByRole('cell').last().innerText();
  await expect(tip).toContainText(total.trim());

  if (mobile) {
    // Au doigt : reste affichée, un nouvel appui sur la colonne la ferme
    await column.tap({ force: true });
  } else {
    await page.mouse.move(5, 5);
  }
  await expect(tip).toBeHidden();
});
