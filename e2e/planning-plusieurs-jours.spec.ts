import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';
import { isSunday, parisDay } from './support/dates';

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

/** Deux jours consécutifs de la même semaine, sans dimanche : lundi et mardi de dans deux semaines. */
function twoWorkdays() {
  let offset = 14;
  while (new Date(`${parisDay(offset)}T12:00:00Z`).getUTCDay() !== 1) offset += 1;
  const first = parisDay(offset);
  if (isSunday(first)) throw new Error('Lundi attendu');
  return { first, second: parisDay(offset + 1) };
}

async function receptionClient() {
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    { auth: { persistSession: false } },
  );
  await client.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  return client;
}

test('un OR du soir au lendemain matin apparaît sur les deux jours du planning', async ({
  page,
}, testInfo) => {
  const id = suffix(testInfo);
  const plate = `NUI${id}`;
  const { first, second } = twoWorkdays();
  const client = await receptionClient();
  const { data: order, error } = await client.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: `Client de nuit ${id}`,
    p_requested_work: 'Boîte de vitesses',
  });
  if (error) throw error;

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/planning?vue=semaine&date=${first}`);
  await page.getByRole('button', { name: new RegExp(`^Assigner un OR le Lundi`) }).click();
  const dialog = page.getByRole('dialog', { name: 'Assigner un OR' });
  await dialog
    .getByLabel('Ordre de réparation')
    .selectOption({ label: `${order.number} · ${plate} · Client de nuit ${id}` });
  await dialog.getByLabel('Technicien').selectOption({ label: 'Bruno' });
  await dialog.getByLabel('Heure de début').fill('20:00');
  await dialog.getByLabel('Heure de fin').fill('08:00');

  // Sans date de fin : refusé, avec une explication
  await dialog.getByRole('button', { name: 'Assigner au planning' }).click();
  await expect(dialog.getByText('L’heure de fin doit être après le début')).toBeVisible();

  await dialog.getByLabel('Date de fin').fill(second);
  await dialog.getByRole('button', { name: 'Assigner au planning' }).click();
  await expect(dialog).toBeHidden();

  const firstDay = page
    .getByTestId(`planning-column-${first}`)
    .getByRole('link', { name: new RegExp(plate) });
  const secondDay = page
    .getByTestId(`planning-column-${second}`)
    .getByRole('link', { name: new RegExp(plate) });
  await expect(firstDay).toContainText('20:00 → Mar');
  await expect(firstDay).toContainText('08:00');
  await expect(secondDay).toContainText('Suite → 08:00');

  // Le bloc touche le bas de la colonne du premier jour et le haut de celle du lendemain
  const column = await page.getByTestId(`planning-column-${first}`).boundingBox();
  const startBox = await firstDay.boundingBox();
  const endBox = await secondDay.boundingBox();
  expect(startBox!.y + startBox!.height).toBeGreaterThan(column!.y + column!.height - 4);
  expect(Math.abs(endBox!.y - column!.y)).toBeLessThan(2);

  // Vue jour du lendemain : le bloc est aussi là, dans la colonne de Bruno
  await page.goto(`/planning?vue=jour&date=${second}`);
  await expect(page.getByRole('link', { name: new RegExp(`Suite → 08:00 ${plate}`) })).toBeVisible();

  // La fiche OR garde le créneau
  await page.getByRole('link', { name: new RegExp(`Suite → 08:00 ${plate}`) }).click();
  await expect(page.getByLabel('Date de fin')).toHaveValue(second);
  await expect(page.getByLabel('Heure de fin')).toHaveValue('08:00');
});

test('rendez-vous sur deux jours, repris par l’OR à l’arrivée du véhicule', async ({ page }, testInfo) => {
  const id = suffix(testInfo);
  const plate = `RNU${id}`;
  const { first, second } = twoWorkdays();
  const client = await receptionClient();
  const { error } = await client.rpc('save_appointment', {
    p_client_name: `Client rdv nuit ${id}`,
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_scheduled_date: first,
    p_start_time: '19:00',
    p_end_time: '09:30',
    p_end_date: second,
    p_reason: 'Embrayage',
  });
  if (error) throw error;

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/planning?vue=semaine&date=${first}`);
  const firstDay = page
    .getByTestId(`planning-column-${first}`)
    .getByRole('button', { name: new RegExp(`Rendez-vous 19:00 → Mar .* 09:30 ${plate}`) });
  await expect(firstDay).toBeVisible();
  await expect(
    page
      .getByTestId(`planning-column-${second}`)
      .getByRole('button', { name: `Rendez-vous Suite → 09:30 ${plate}` }),
  ).toBeVisible();

  await firstDay.click();
  const dialog = page.getByRole('dialog', { name: 'Rendez-vous' });
  await expect(dialog.getByLabel('Date de fin')).toHaveValue(second);
  await dialog.getByRole('button', { name: 'Le véhicule est arrivé : créer l’OR' }).click();

  await expect(page).toHaveURL(/\/or\/[0-9a-f-]{36}$/);
  await expect(page.getByLabel('Date de fin')).toHaveValue(second);
});
