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

/** Décalage horizontal de la pastille du sélecteur de thème (::before). */
function pillOffset(page: Page) {
  return page.evaluate(() => {
    const switcher = [...document.querySelectorAll('.theme-sw')].find(
      (element) => (element as HTMLElement).offsetParent !== null,
    );
    if (!switcher) return null;
    const transform = getComputedStyle(switcher, '::before').transform;
    return transform === 'none' ? 0 : Number(transform.split(',')[4]);
  });
}

type FadeWatch = Window & { themeFadeSeen?: boolean };

/** La classe de fondu du thème ne dure qu'un instant : on note son passage plutôt que de la guetter. */
async function watchThemeFade(page: Page) {
  await page.evaluate(() => {
    const root = document.documentElement;
    (window as FadeWatch).themeFadeSeen = false;
    new MutationObserver(() => {
      if (root.classList.contains('theme-anim')) (window as FadeWatch).themeFadeSeen = true;
    }).observe(root, { attributes: true, attributeFilter: ['class'] });
  });
}

const themeFadeSeen = (page: Page) => page.evaluate(() => (window as FadeWatch).themeFadeSeen);

test('sélecteur de thème : la pastille glisse sous le choix, les couleurs passent en fondu', async ({
  page,
}) => {
  await loginAs(page, 'reception@rts.local');
  const html = page.locator('html');
  const nav = await sideNav(page);
  await expect.poll(() => pillOffset(page)).toBe(0);
  await watchThemeFade(page);

  await nav.getByRole('button', { name: 'Sombre' }).click();
  // Fondu des couleurs : classe posée le temps de la bascule, puis retirée
  await expect(html).toHaveClass(/\bdark\b/);
  expect(await themeFadeSeen(page)).toBe(true);
  await expect(html).not.toHaveClass(/\btheme-anim\b/);
  await expect.poll(() => pillOffset(page)).toBeGreaterThan(40);

  await (await sideNav(page)).getByRole('button', { name: 'Clair' }).click();
  await expect(html).not.toHaveClass(/\bdark\b/);
  await expect.poll(() => pillOffset(page)).toBe(0);
});

test('groupes du menu : ouverture animée, groupe replié hors de l’accessibilité', async ({
  page,
}, testInfo) => {
  test.skip(isMobile(testInfo.project.name), 'Barre latérale fixe : grand écran');
  await loginAs(page, 'reception@rts.local');
  const nav = page.getByRole('navigation', { name: 'Navigation principale' });
  const group = nav.getByRole('button', { name: 'Facturation', exact: true });
  const fold = page.locator('#nav-facturation');

  await expect(group).toHaveAttribute('aria-expanded', 'false');
  await expect(fold).toHaveAttribute('aria-hidden', 'true');
  await expect(nav.getByRole('link', { name: 'Avoirs' })).toHaveCount(0);
  const transition = await fold.evaluate((element) => getComputedStyle(element).transitionProperty);
  expect(transition).toContain('grid-template-rows');

  await group.click();
  await expect(fold).not.toHaveAttribute('aria-hidden');
  await expect(nav.getByRole('link', { name: 'Avoirs' })).toBeVisible();
  await expect
    .poll(() => fold.evaluate((element) => element.getBoundingClientRect().height))
    .toBeGreaterThan(60);

  await group.click();
  await expect(nav.getByRole('link', { name: 'Avoirs' })).toHaveCount(0);
  await expect.poll(() => fold.evaluate((element) => element.getBoundingClientRect().height)).toBe(0);
  // Un lien replié ne prend plus le focus clavier
  expect(await fold.evaluate((element) => (element as HTMLElement).inert)).toBe(true);
});

test('boutons : enfoncement léger à l’appui', async ({ page }, testInfo) => {
  test.skip(isMobile(testInfo.project.name), 'Souris : grand écran');
  await loginAs(page, 'direction@rts.local');
  const button = page.getByRole('link', { name: 'Nouvel OR' }).first();
  await expect(button).toBeVisible();
  const scale = () =>
    button.evaluate((element) => {
      // Tailwind 4 : propriété « scale » ; feuille rts.css : « transform »
      const style = getComputedStyle(element);
      if (style.scale !== 'none') return Number(style.scale.split(' ')[0]);
      // matrix(a, b, c, d, e, f) : « a » porte l'échelle horizontale
      return style.transform === 'none' ? 1 : new DOMMatrix(style.transform).a;
    });

  await button.hover();
  await page.mouse.down();
  await expect.poll(scale).toBeLessThan(1);
  await page.mouse.move(0, 0);
  await page.mouse.up();
  await expect.poll(scale).toBe(1);
});

test('réduire les animations : tout devient instantané, pas de fondu du thème', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await loginAs(page, 'reception@rts.local');

  const durations = await page.evaluate(() => {
    const probe = (className: string) => {
      const element = document.createElement('div');
      element.className = className;
      document.body.appendChild(element);
      const style = getComputedStyle(element);
      const result = { transition: style.transitionDuration, animation: style.animationDuration };
      element.remove();
      return result;
    };
    return { btn: probe('btn'), alert: probe('alert'), fold: probe('subnav-fold') };
  });
  for (const { transition, animation } of Object.values(durations)) {
    for (const value of transition.split(',')) expect(parseFloat(value)).toBeLessThanOrEqual(0.001);
    expect(parseFloat(animation)).toBeLessThanOrEqual(0.001);
  }

  const html = page.locator('html');
  await watchThemeFade(page);
  await (await sideNav(page)).getByRole('button', { name: 'Sombre' }).click();
  await expect(html).toHaveClass(/\bdark\b/);
  // Aucun fondu des couleurs, même un instant
  expect(await themeFadeSeen(page)).toBe(false);
  await (await sideNav(page)).getByRole('button', { name: 'Clair' }).click();
  await expect(html).not.toHaveClass(/\bdark\b/);
});

test('fenêtres : ouverture animée et fermeture plus courte', async ({ page }) => {
  await loginAs(page, 'direction@rts.local');
  await page
    .getByRole('button', { name: /Alertes/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: 'Alertes' });
  await expect(dialog).toBeVisible();
  const timing = await dialog.evaluate((element) => {
    const style = getComputedStyle(element);
    return { name: style.animationName, duration: style.animationDuration, origin: style.transformOrigin };
  });
  expect(timing.name).not.toBe('none');
  expect(parseFloat(timing.duration)).toBeCloseTo(0.2, 2);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
