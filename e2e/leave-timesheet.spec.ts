import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';
import { parisDayOfPreviousMonth } from './support/dates';

const env = loadEnv('production', process.cwd(), 'VITE_');
const PASSWORD = 'atelier-dev-2026';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
}

const suffix = (testInfo: TestInfo) =>
  `${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-7)}`;

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** Jour futur (hors dimanche) tiré au hasard : les congés d'un technicien ne se chevauchent pas. */
function randomFutureDay() {
  const date = new Date(2030, 0, 1);
  date.setDate(date.getDate() + Math.floor(Math.random() * 3000));
  if (date.getDay() === 0) date.setDate(date.getDate() + 1);
  return iso(date);
}

const frenchDate = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;

async function directionClient() {
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      auth: { persistSession: false },
    },
  );
  await client.auth.signInWithPassword({ email: 'direction@rts.local', password: PASSWORD });
  return client;
}

async function secondPage(browser: Browser, testInfo: TestInfo, email: string) {
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
  await loginAs(page, email);
  return page;
}

test('le technicien demande un congé, la direction le valide', async ({ page, browser }, testInfo) => {
  test.slow();
  const comment = `Formation ${suffix(testInfo)}`;
  const day = randomFutureDay();

  await loginAs(page, 'alice@rts.local');
  await page.getByRole('button', { name: 'Demander un congé' }).click();
  const dialog = page.getByRole('dialog', { name: 'Demande de congé' });
  await dialog.getByLabel('Type').selectOption({ label: 'Formation' });
  await dialog.getByLabel('Du').fill(day);
  await dialog.getByLabel('Au (inclus)').fill(day);
  await dialog.getByLabel('Commentaire').fill(comment);
  await dialog.getByRole('button', { name: 'Envoyer la demande' }).click();
  await expect(dialog).toBeHidden();
  const mine = page.getByRole('listitem').filter({ hasText: `le ${frenchDate(day)}` });
  await expect(mine).toContainText('En attente');

  const office = await secondPage(browser, testInfo, 'direction@rts.local');
  await office.goto('/pointages/conges');
  const request = office
    .getByRole('region', { name: /Demandes à traiter/ })
    .getByRole('article')
    .filter({ hasText: comment });
  await expect(request).toContainText(`le ${frenchDate(day)} (1 j)`);
  await request.getByRole('button', { name: 'Valider' }).click();
  await expect(
    office.getByRole('region', { name: 'Historique' }).getByRole('article').filter({ hasText: comment }),
  ).toContainText('Validée');
  await office.context().close();

  await page.reload();
  await expect(mine).toContainText('Validée');
  await expect(mine.getByRole('button', { name: 'Annuler' })).toHaveCount(0);
});

test('la direction saisit une absence puis la supprime', async ({ page }, testInfo) => {
  const comment = `Arrêt ${suffix(testInfo)}`;
  const day = randomFutureDay();

  await loginAs(page, 'direction@rts.local');
  await page.goto('/pointages/conges');
  await page.getByRole('button', { name: 'Ajouter une absence' }).click();
  const dialog = page.getByRole('dialog', { name: 'Ajouter une absence' });
  await dialog.getByLabel('Technicien').selectOption({ label: 'Bruno' });
  await dialog.getByLabel('Type').selectOption({ label: 'Maladie' });
  await dialog.getByLabel('Du').fill(day);
  await dialog.getByLabel('Au (inclus)').fill(day);
  await dialog.getByLabel('Commentaire').fill(comment);
  await dialog.getByRole('button', { name: 'Enregistrer l’absence' }).click();
  await expect(dialog).toBeHidden();

  const absence = page
    .getByRole('region', { name: 'Historique' })
    .getByRole('article')
    .filter({ hasText: comment });
  await expect(absence).toContainText('Validée');
  await absence.getByRole('button', { name: 'Supprimer' }).click();
  await page
    .getByRole('dialog', { name: 'Supprimer cette absence ?' })
    .getByRole('button', { name: 'Supprimer' })
    .click();
  await expect(absence).toHaveCount(0);
});

test('relevé d’heures du mois et export CSV pour la paie', async ({ page }, testInfo) => {
  const name = `Relevé ${suffix(testInfo)}`;
  const day = parisDayOfPreviousMonth(3);
  const month = day.slice(0, 7);

  const client = await directionClient();
  const { data: tech, error } = await client
    .from('technicians')
    .insert({ display_name: name })
    .select('id')
    .single();
  if (error) throw error;
  for (const [type, time] of [
    ['in', '08:30'],
    ['out', '18:00'],
  ] as const) {
    const result = await client.rpc('add_manual_clock_event', {
      p_technician_id: tech.id,
      p_event_type: type,
      p_work_date: day,
      p_time: time,
      p_reason: 'Test relevé',
    });
    if (result.error) throw result.error;
  }

  await loginAs(page, 'direction@rts.local');
  await page.goto(`/pointages/releve?mois=${month}`);
  await expect(page.getByRole('article', { name })).toContainText(
    '1 jour travaillé — 9h30 — HS : 0h00 — 0 retard',
  );

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV (paie)' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(`releve_heures_${month}.csv`);
  const content = await readFile((await file.path()) ?? '', 'utf8');
  expect(content).toContain('Mois;Technicien;Semaine;Heures travaillées;Heures sup. après 18h30');
  expect(content).toContain(`${month};${name};TOTAL MOIS;9,50;0,00;1;0;0;0;0`);
});

test('la réception n’a pas accès aux congés ni au relevé', async ({ page }) => {
  await loginAs(page, 'reception@rts.local');
  for (const path of ['/pointages/conges', '/pointages/releve']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Accès refusé' })).toBeVisible();
  }
});
