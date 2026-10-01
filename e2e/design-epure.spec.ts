import { expect, test, type Page } from '@playwright/test';
import { sideNav } from './support/nav';

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

/** Couleurs et formes de la coquille du bureau : fond de page, barre latérale, cadre du contenu. */
async function shellStyles(page: Page) {
  return page.evaluate(() => {
    const side = document.querySelector('aside.side');
    const frame = document.querySelector('main')?.parentElement;
    const body = getComputedStyle(document.body);
    const frameStyle = frame ? getComputedStyle(frame) : null;
    return {
      page: body.backgroundColor,
      side: side ? getComputedStyle(side).backgroundColor : null,
      sideBorder: side ? getComputedStyle(side).borderRightWidth : null,
      frame: frameStyle?.backgroundColor ?? null,
      frameRadius: frameStyle?.borderTopLeftRadius ?? null,
      frameBorder: frameStyle?.borderTopWidth ?? null,
    };
  });
}

test('police Geist chargée et utilisée partout', async ({ page }) => {
  await loginAs(page, 'reception@rts.local');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  const font = await page.evaluate(async () => {
    await document.fonts.ready;
    const title = document.querySelector('h1');
    return {
      loaded: document.fonts.check('14px "Geist Variable"'),
      body: getComputedStyle(document.body).fontFamily,
      title: title ? getComputedStyle(title).fontFamily : '',
    };
  });
  expect(font.loaded).toBe(true);
  expect(font.body).toMatch(/^"?Geist Variable/);
  expect(font.title).toMatch(/^"?Geist Variable/);
});

test('bureau : barre latérale fondue dans le fond, contenu dans un cadre blanc', async ({
  page,
}, testInfo) => {
  test.skip(isMobile(testInfo.project.name), 'Cadre du contenu : grand écran');
  await loginAs(page, 'reception@rts.local');
  await page.goto('/or');
  await expect(page.getByRole('heading', { name: 'Ordres de réparation', level: 1 })).toBeVisible();

  const light = await shellStyles(page);
  expect(light.side).toBe(light.page);
  expect(light.sideBorder).toBe('0px');
  expect(light.frame).toBe('rgb(255, 255, 255)');
  expect(light.frame).not.toBe(light.page);
  expect(light.frameRadius).toBe('12px');
  expect(light.frameBorder).toBe('1px');

  // Même principe en sombre : la barre se fond dans le fond, le cadre reste plus clair.
  await (await sideNav(page)).getByRole('button', { name: 'Sombre' }).click();
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  const dark = await shellStyles(page);
  expect(dark.side).toBe(dark.page);
  expect(dark.frame).not.toBe(dark.page);
  await (await sideNav(page)).getByRole('button', { name: 'Clair' }).click();
});

test('téléphone : pas de cadre autour du contenu', async ({ page }, testInfo) => {
  test.skip(!isMobile(testInfo.project.name), 'Vérification propre au téléphone');
  await loginAs(page, 'reception@rts.local');
  await page.goto('/clients');
  await expect(page.getByRole('heading', { name: 'Clients', level: 1 })).toBeVisible();
  const styles = await shellStyles(page);
  expect(styles.frameRadius).toBe('0px');
  expect(styles.frameBorder).toBe('0px');
});

test('tableau de bord : compteurs d’OR en une seule bande, panneaux sans cadre', async ({ page }) => {
  await loginAs(page, 'direction@rts.local');
  const orders = page.getByRole('region', { name: 'Ordres de réparation' });
  const counters = orders.getByRole('listitem');
  await expect(counters).toHaveCount(6);
  await expect(counters.getByRole('link').first()).toBeVisible();

  const layout = await page.evaluate(() => {
    const strip = document.querySelector('.kstrip');
    const tiles = [...document.querySelectorAll('.kstrip .tile')];
    const panels = [...document.querySelectorAll('section.card.flat')];
    return {
      stripBorder: strip ? getComputedStyle(strip).borderTopWidth : null,
      stripRadius: strip ? getComputedStyle(strip).borderTopLeftRadius : null,
      tileBorders: tiles.map((tile) => getComputedStyle(tile).borderTopWidth),
      panelBorders: panels.map((panel) => getComputedStyle(panel).borderTopWidth),
    };
  });
  expect(layout.stripBorder).toBe('1px');
  expect(layout.stripRadius).toBe('10px');
  expect(layout.tileBorders).toEqual(Array(6).fill('0px'));
  expect(layout.panelBorders).toEqual(['0px', '0px']);
  await expect(page.getByRole('heading', { name: 'À suivre' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Charge de travail atelier' })).toBeVisible();
});

test('formes : coins resserrés, sans ombre, pastilles carrées', async ({ page }) => {
  await loginAs(page, 'reception@rts.local');
  const shapes = await page.evaluate(() => {
    const probe = (className: string) => {
      const element = document.createElement(className.startsWith('btn') ? 'button' : 'div');
      element.className = className;
      element.textContent = 'Témoin';
      document.body.appendChild(element);
      const style = getComputedStyle(element);
      const result = { radius: style.borderTopLeftRadius, shadow: style.boxShadow, height: style.height };
      element.remove();
      return result;
    };
    const dot = document.createElement('span');
    dot.className = 'badge dot';
    document.body.appendChild(dot);
    const marker = getComputedStyle(dot, '::before').borderTopLeftRadius;
    dot.remove();
    return { btn: probe('btn'), card: probe('card'), badge: probe('badge'), inp: probe('inp'), marker };
  });
  expect(shapes.btn.radius).toBe('7px');
  expect(shapes.btn.height).toBe('36px');
  expect(shapes.inp.radius).toBe('7px');
  expect(shapes.card.radius).toBe('10px');
  expect(shapes.card.shadow).toBe('none');
  expect(shapes.badge.radius).toBe('5px');
  // Repère de statut : petit carré arrondi, plus de rond.
  expect(shapes.marker).toBe('2px');
});
