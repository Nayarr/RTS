import { expect, test, type Page } from '@playwright/test';

// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';
/** Hauteur de la zone de la Dynamic Island d'un iPhone, en mode appli installée. */
const ISLAND = 59;

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();
}

test('téléphone à encoche : barre du haut sous la Dynamic Island, même après défilement', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), 'Téléphone seulement');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', {
    insets: { top: ISLAND, bottom: 34, left: 0, right: 0 },
  });
  await loginAs(page, 'reception@rts.local');
  await page.goto('/devis');

  const bar = page.locator('header.mbar').first();
  await expect(bar).toBeVisible();
  const topOfBar = async () => (await bar.boundingBox())!.y;
  expect(await topOfBar()).toBe(ISLAND);

  // Page plus haute que l'écran : la barre reste sous l'encoche en faisant défiler
  await page.evaluate(() => {
    document.querySelector('main')!.style.minHeight = '3000px';
    window.scrollTo(0, 800);
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  expect(await topOfBar()).toBe(ISLAND);

  // Le contenu ne passe pas visible derrière l'encoche : la zone garde la couleur de la barre
  const cover = await bar.evaluate((header) => {
    const style = getComputedStyle(header, '::before');
    return {
      height: style.height,
      background: style.backgroundColor,
      bar: getComputedStyle(header).backgroundColor,
    };
  });
  expect(cover.height).toBe(`${ISLAND}px`);
  expect(cover.background).toBe(cover.bar);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/barre-encoche.png` });

  // Menu : son contenu commence sous l'encoche
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('button', { name: 'Menu' }).click();
  const brand = page.getByRole('dialog', { name: 'Menu' }).getByText('RTS Atelier').first();
  await expect(brand).toBeVisible();
  expect((await brand.boundingBox())!.y).toBeGreaterThanOrEqual(ISLAND);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/menu-encoche.png` });
});
