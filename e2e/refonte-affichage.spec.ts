import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';
import { sideNav } from './support/nav';

const env = loadEnv('production', process.cwd(), 'VITE_');
// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();
}

const isMobile = (testInfo: TestInfo) => testInfo.project.name.includes('mobile');
const suffix = (testInfo: TestInfo) => `${isMobile(testInfo) ? 'M' : 'D'}${String(Date.now()).slice(-7)}`;

/** Devis accepté de plusieurs travaux transformé en OR (API : réception). */
async function orderFromQuote(plate: string, clientName: string) {
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      auth: { persistSession: false },
    },
  );
  await client.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: quote, error } = await client.rpc('create_quote', {
    p_client_name: clientName,
    p_plate: plate,
    p_vehicle_type: 'pl',
  });
  if (error) throw error;
  const lines = await client.from('quote_lines').insert([
    {
      quote_id: quote.id,
      position: 0,
      line_type: 'labor',
      description: 'Remplacement Barre de direction',
      unit_price: 180,
      quantity: 1,
    },
    {
      quote_id: quote.id,
      position: 1,
      line_type: 'labor',
      description: 'Remplacement Kit accessoires',
      unit_price: 240,
      quantity: 1,
    },
    {
      quote_id: quote.id,
      position: 2,
      line_type: 'labor',
      description: 'Remplacement Extincteur 6 kg camion',
      unit_price: 45,
      quantity: 1,
    },
  ]);
  if (lines.error) throw lines.error;
  const accepted = await client.rpc('set_quote_response', { p_quote_id: quote.id, p_status: 'accepted' });
  if (accepted.error) throw accepted.error;
  const { data: orderId, error: orderError } = await client.rpc('create_repair_order_from_quote', {
    p_quote_id: quote.id,
  });
  if (orderError) throw orderError;
  return orderId;
}

test('fenêtre des alertes : le titre garde sa marge intérieure', async ({ page }) => {
  await loginAs(page, 'direction@rts.local');
  await page
    .getByRole('button', { name: /Alertes/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: 'Alertes' });
  await expect(dialog).toBeVisible();
  const [dialogBox, titleBox] = await Promise.all([
    dialog.boundingBox(),
    dialog.getByRole('heading', { name: 'Alertes' }).boundingBox(),
  ]);
  expect((titleBox?.x ?? 0) - (dialogBox?.x ?? 0)).toBeGreaterThanOrEqual(12);
});

test('OR créé depuis un devis : une tâche à faire par ligne', async ({ page }, testInfo) => {
  const id = suffix(testInfo);
  const orderId = await orderFromQuote(`TL${id}`, `Client tâches ${id}`);
  const tasks = [
    'Remplacement Barre de direction',
    'Remplacement Kit accessoires',
    'Remplacement Extincteur 6 kg camion',
  ];

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/or/${orderId}`);
  const header = page.getByRole('region', { name: 'Véhicule et demande' });
  await expect(header.getByRole('listitem')).toHaveText(tasks);
  // Fiche « Informations OR » : chaque tâche sur sa ligne
  await expect(page.getByLabel('Tâche à faire')).toHaveValue(tasks.join('\n'));
});

test('menu : « Tableau de bord » reste en haut pendant que les groupes défilent', async ({
  page,
}, testInfo) => {
  test.skip(isMobile(testInfo), 'Barre latérale fixe : grand écran');
  await page.setViewportSize({ width: 1280, height: 560 });
  await loginAs(page, 'direction@rts.local');
  const nav = page.getByRole('navigation', { name: 'Navigation principale' });
  for (const group of ['Atelier', 'Clients', 'Facturation', 'Équipe', 'Stock', 'Pilotage']) {
    const toggle = nav.getByRole('button', { name: group, exact: true });
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  }
  const dashboard = nav.getByRole('link', { name: 'Tableau de bord' });
  const top = (await dashboard.boundingBox())?.y;

  // Dernier lien du menu : Playwright attend la fin de l'ouverture des groupes avant de défiler
  const last = nav.getByRole('link', { name: /^Performance/ });
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
  const scrolled = await nav.locator('.nav-scroll').evaluate((element) => element.scrollTop);
  expect(scrolled).toBeGreaterThan(0);
  await expect(dashboard).toBeInViewport();
  expect((await dashboard.boundingBox())?.y).toBe(top);
});

test('barres de défilement fines et sans piste, en clair comme en sombre', async ({ page }) => {
  await loginAs(page, 'reception@rts.local');
  const scrollbar = () =>
    page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return { width: style.scrollbarWidth, color: style.scrollbarColor };
    });

  const light = await scrollbar();
  expect(light.width).toBe('thin');
  expect(light.color).toMatch(/^rgb\(\d+, \d+, \d+\) rgba\(0, 0, 0, 0\)$/);

  await (await sideNav(page)).getByRole('button', { name: 'Sombre' }).click();
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  const dark = await scrollbar();
  expect(dark.width).toBe('thin');
  expect(dark.color).toMatch(/rgba\(0, 0, 0, 0\)$/);
  expect(dark.color).not.toBe(light.color);
  await (await sideNav(page)).getByRole('button', { name: 'Clair' }).click();
});
