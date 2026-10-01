import { expect, test, type Page } from '@playwright/test';
import { goTo, sideNav } from './support/nav';

// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();
}

const isMobile = (projectName: string) => projectName.includes('mobile');

/** Écrans du bureau sans identifiant dans l'adresse. */
const OFFICE_SCREENS = [
  '/',
  '/or',
  '/or/nouveau',
  '/atelier-en-direct',
  '/planning',
  '/rendez-vous',
  '/clients',
  '/vehicules',
  '/vehicules/echeances',
  '/contrats',
  '/devis',
  '/devis/nouveau',
  '/factures',
  '/factures/avoirs',
  '/garanties',
  '/pointages',
  '/pointages/conges',
  '/pointages/releve',
  '/equipe',
  '/stock/consommables',
  '/stock/pieces',
  '/stock/forfaits',
  '/pilotage/statistiques',
  '/pilotage/tresorerie',
  '/pilotage/rentabilite',
  '/pilotage/performance',
  '/reglages',
  '/aide',
];

test('téléphone : aucun écran du bureau ne déborde en largeur', async ({ page }, testInfo) => {
  test.skip(!isMobile(testInfo.project.name), 'Vérification propre au téléphone');
  test.slow();
  await loginAs(page, 'direction@rts.local');
  const width = page.viewportSize()?.width ?? 0;

  const overflowing: string[] = [];
  for (const path of OFFICE_SCREENS) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    if (scrollWidth > width + 1) overflowing.push(`${path} (${scrollWidth}px)`);
  }
  expect(overflowing, 'Écrans plus larges que le téléphone').toEqual([]);
});

test('thème sombre choisi, conservé après rechargement', async ({ page }) => {
  await loginAs(page, 'reception@rts.local');
  const html = page.locator('html');
  await expect(html).not.toHaveClass(/\bdark\b/);

  await (await sideNav(page)).getByRole('button', { name: 'Sombre' }).click();
  await expect(html).toHaveClass(/\bdark\b/);
  await page.reload();
  await expect(html).toHaveClass(/\bdark\b/);

  await (await sideNav(page)).getByRole('button', { name: 'Clair' }).click();
  await expect(html).not.toHaveClass(/\bdark\b/);
});

test('barre latérale : groupe de l’écran ouvert, groupes repliables', async ({ page }, testInfo) => {
  test.skip(isMobile(testInfo.project.name), 'Barre latérale fixe : grand écran');
  await loginAs(page, 'reception@rts.local');
  await page.goto('/devis');
  const nav = page.getByRole('navigation', { name: 'Navigation principale' });

  const billing = nav.getByRole('button', { name: 'Facturation', exact: true });
  await expect(billing).toHaveAttribute('aria-expanded', 'true');
  await expect(nav.getByRole('link', { name: /^Devis/ })).toHaveAttribute('aria-current', 'page');

  await billing.click();
  await expect(billing).toHaveAttribute('aria-expanded', 'false');
  await expect(nav.getByRole('link', { name: /^Devis/ })).toHaveCount(0);

  const workshop = nav.getByRole('button', { name: 'Atelier', exact: true });
  await workshop.click();
  await expect(workshop).toHaveAttribute('aria-expanded', 'true');
  await nav.getByRole('link', { name: 'Planning', exact: true }).click();
  await expect(page).toHaveURL(/\/planning/);
  await expect(page.getByRole('heading', { name: 'Planning', level: 1 })).toBeVisible();
});

test('téléphone : le menu se referme après avoir choisi un écran', async ({ page }, testInfo) => {
  test.skip(!isMobile(testInfo.project.name), 'Tiroir de menu : téléphone');
  await loginAs(page, 'reception@rts.local');
  await goTo(page, 'Clients', 'Véhicules');
  await expect(page).toHaveURL(/\/vehicules$/);
  await expect(page.getByRole('dialog', { name: 'Menu' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Véhicules', level: 1 })).toBeVisible();
});

test('réglages : sections à gauche et lien direct vers une section', async ({ page }) => {
  await loginAs(page, 'direction@rts.local');
  await page.goto('/reglages');
  const sections = page.getByRole('tablist', { name: 'Sections des réglages' });
  await expect(sections.getByRole('tab', { name: 'Entreprise' })).toHaveAttribute('aria-selected', 'true');

  await sections.getByRole('tab', { name: 'Taux horaires' }).click();
  await expect(sections.getByRole('tab', { name: 'Taux horaires' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Taux horaires' })).toBeVisible();
  await expect(page.getByLabel(/^Taux HT \(€\/h\)/).first()).toBeVisible();

  await page.goto('/reglages?onglet=sauvegarde');
  await expect(page.getByRole('tab', { name: 'Sauvegarde' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'Télécharger la sauvegarde' })).toBeVisible();
});

test('aide : un sujet choisi s’affiche à côté de la liste', async ({ page }) => {
  await loginAs(page, 'reception@rts.local');
  await page.goto('/aide');
  await expect(page.getByRole('article', { name: 'Démarrer un OR' })).toBeVisible();

  const office = page.getByRole('region', { name: 'Pour la réception et la direction' });
  await office.getByRole('button', { name: 'Facturer' }).click();
  await expect(office.getByRole('button', { name: 'Facturer' })).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('article', { name: 'Facturer' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Démarrer un OR' })).toHaveCount(0);
});

test('couleurs des statuts : alertes et pastilles colorées, barres visibles', async ({ page }) => {
  await loginAs(page, 'reception@rts.local');

  // Styles appliqués par la feuille de la maquette, mesurés sur des éléments témoins.
  const styles = await page.evaluate(() => {
    const probe = (className: string, parent?: HTMLElement) => {
      const element = document.createElement('div');
      element.className = className;
      (parent ?? document.body).appendChild(element);
      const style = getComputedStyle(element);
      const result = {
        background: style.backgroundColor,
        border: style.borderTopColor,
        height: element.getBoundingClientRect().height,
      };
      element.remove();
      return result;
    };
    const column = document.createElement('div');
    column.className = 'col';
    column.style.width = '200px';
    document.body.appendChild(column);
    const bar = probe('bar', column);
    column.remove();

    const tinted = document.createElement('div');
    tinted.style.setProperty('--c', 'rgb(19, 112, 23)');
    document.body.appendChild(tinted);
    const inheritedBadge = probe('badge', tinted);
    tinted.remove();

    return {
      alertOk: probe('alert s-ok'),
      alertBad: probe('alert s-bad'),
      alertBlue: probe('alert s-blue'),
      alertDefault: probe('alert'),
      badgeOk: probe('badge s-ok'),
      badgeBad: probe('badge s-bad'),
      badgeDefault: probe('badge'),
      inheritedBadge,
      bar,
    };
  });

  // Chaque statut a sa couleur (la maquette mettait toutes les alertes en orange).
  const alertColors = new Set(
    [styles.alertOk, styles.alertBad, styles.alertBlue, styles.alertDefault].map((s) => s.border),
  );
  expect(alertColors.size).toBe(4);
  expect(styles.badgeOk.border).not.toBe(styles.badgeBad.border);
  // Pastille sans couleur : celle de son bloc (sinon grise).
  expect(styles.inheritedBadge.border).not.toBe(styles.badgeDefault.border);
  // Barre empilée en colonne : garde sa hauteur.
  expect(styles.bar.height).toBe(8);
});
