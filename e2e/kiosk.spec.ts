import { createClient } from '@supabase/supabase-js';
import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';
import { parisDay } from './support/dates';

const env = loadEnv('production', process.cwd(), 'VITE_');
const PASSWORD = 'atelier-dev-2026';

// Caméra simulée par Chrome (image de test) : la borne exige une photo pour pointer.
test.use({
  permissions: ['camera'],
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
});

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).not.toHaveURL(/\/connexion/);
}

const suffix = (testInfo: TestInfo) =>
  `${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-7)}`;

/** Technicien créé pour le test, avec un code PIN unique (API : direction). */
async function createTechnician(name: string) {
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      auth: { persistSession: false },
    },
  );
  await client.auth.signInWithPassword({ email: 'direction@rts.local', password: PASSWORD });
  const { data, error } = await client
    .from('technicians')
    .insert({ display_name: name })
    .select('id')
    .single();
  if (error) throw error;
  for (;;) {
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    const result = await client.rpc('set_technician_pin', { p_technician_id: data.id, p_pin: pin });
    if (!result.error) return { id: data.id, pin };
    if (result.error.code !== '23505') throw result.error;
  }
}

async function directionPage(browser: Browser, testInfo: TestInfo) {
  const { baseURL, viewport, userAgent, isMobile, hasTouch, locale, timezoneId } = testInfo.project.use;
  const context = await browser.newContext({
    baseURL,
    viewport,
    userAgent,
    isMobile,
    hasTouch,
    locale,
    timezoneId,
  });
  const page = await context.newPage();
  await loginAs(page, 'direction@rts.local');
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
  return page;
}

test('le technicien pointe à la borne ; la direction voit la présence et la photo', async ({
  page,
  browser,
}, testInfo) => {
  test.slow();
  const name = `Borne ${suffix(testInfo)}`;
  const tech = await createTechnician(name);

  await loginAs(page, 'borne@rts.local');
  await expect(page.getByText('Borne de pointage')).toBeVisible();
  const status = page.getByRole('status');
  await expect(status).toHaveText('Tape ton code PIN puis OK');
  for (const digit of tech.pin) await page.getByRole('button', { name: digit, exact: true }).click();
  await page.getByRole('button', { name: 'Valider' }).click();
  await expect(status).toContainText(`Bonjour ${name}`, { timeout: 15_000 });
  await expect(status).toContainText('Arrivée enregistrée à');

  // Deuxième passage dans la minute : refusé.
  await expect(status).toHaveText('Tape ton code PIN puis OK', { timeout: 10_000 });
  await page.keyboard.type(tech.pin);
  await page.keyboard.press('Enter');
  await expect(status).toContainText("Déjà pointé il y a moins d'une minute (arrivée).", { timeout: 15_000 });

  const office = await directionPage(browser, testInfo);
  await office.goto('/pointages');
  const card = office.getByRole('article', { name });
  await expect(card.getByText('Présent')).toBeVisible();
  const photo = card.getByRole('button', { name: /^Photo : Arrivée \d{2}:\d{2}$/ });
  await expect(photo).toBeVisible();
  await photo.click();
  await expect(office.getByRole('dialog').getByRole('img')).toBeVisible();
  await office.context().close();
});

test('la direction corrige un oubli de badge puis supprime la correction', async ({ page }, testInfo) => {
  const name = `Oubli ${suffix(testInfo)}`;
  await createTechnician(name);
  const date = parisDay(-1);

  await loginAs(page, 'direction@rts.local');
  await page.goto(`/pointages?date=${date}`);
  await page.getByRole('button', { name: 'Ajouter une correction' }).click();
  const dialog = page.getByRole('dialog', { name: 'Correction de pointage' });
  await dialog.getByLabel('Technicien').selectOption({ label: name });
  await dialog.getByLabel('Heure').fill('08:15');
  await dialog.getByLabel('Motif').fill('Oubli de badge');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog).toBeHidden();

  const card = page.getByRole('article', { name });
  await expect(card.getByText('Arrivée 08:15')).toBeVisible();
  await expect(card.getByText(/Pointage incomplet/)).toBeVisible(); // arrivée sans départ, jour passé
  await card.getByRole('button', { name: 'Supprimer la correction : Arrivée 08:15' }).click();
  await page
    .getByRole('dialog', { name: 'Supprimer cette correction ?' })
    .getByRole('button', { name: 'Supprimer' })
    .click();
  await expect(card.getByText('Aucun pointage')).toBeVisible();
});

test('code de sortie choisi par la direction pour quitter la borne', async ({ page, browser }, testInfo) => {
  const office = await directionPage(browser, testInfo);
  await office.goto('/pointages');
  await office.getByRole('button', { name: /(Définir|Changer) le code/ }).click();
  const dialog = office.getByRole('dialog', { name: 'Code de sortie de la borne' });
  await dialog.getByLabel('Nouveau code').fill('97531');
  await dialog.getByLabel('Confirme le code').fill('97531');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog).toBeHidden();
  await expect(office.getByText('Défini', { exact: true })).toBeVisible();
  await office.context().close();

  await loginAs(page, 'borne@rts.local');
  await page.getByRole('button', { name: 'Quitter la borne' }).click();
  // Pas de mauvais code ici : les erreurs comptent dans la limite anti force brute de la borne.
  await page.getByLabel('Code de sortie').fill('97531');
  await page.getByRole('button', { name: 'Quitter' }).click();
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
});

test('la réception n’a pas accès aux pointages', async ({ page }) => {
  await loginAs(page, 'reception@rts.local');
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Pointages', exact: true })).toHaveCount(0);
  await page.goto('/pointages');
  await expect(page.getByRole('heading', { name: 'Accès refusé' })).toBeVisible();
});
