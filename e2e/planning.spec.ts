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

/** Jour « AAAA-MM-JJ » (Paris) dans `days` jours, jamais un dimanche (atelier fermé). */
function workday(days: number) {
  const day = parisDay(days);
  return isSunday(day) ? parisDay(days + 1) : day;
}

async function receptionClient() {
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      auth: { persistSession: false },
    },
  );
  await client.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  return client;
}

test('rendez-vous pris au planning, puis OR créé à l’arrivée du véhicule', async ({ page }, testInfo) => {
  test.slow();
  const id = suffix(testInfo);
  const plate = `RDV${id}`;
  const date = workday(7);

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/planning?vue=semaine&date=${date}`);
  await page.getByRole('button', { name: 'Nouveau rendez-vous' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nouveau rendez-vous' });
  await dialog.getByLabel('Client').fill(`Client planning ${id}`);
  await dialog.getByLabel('Immatriculation').fill(plate);
  await dialog.getByLabel('Date').fill(date);
  await dialog.getByLabel('Heure').fill('10:00');
  await dialog.getByLabel('Fin prévue').fill('11:30');
  await dialog.getByLabel('Motif').fill('Vidange + freins');
  await dialog.getByLabel('Technicien (facultatif)').selectOption({ label: 'Alice' });
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog).toBeHidden();

  const block = page
    .getByTestId(`planning-column-${date}`)
    .getByRole('button', { name: `Rendez-vous 10:00 ${plate}` });
  // Rechargement du planning après l'enregistrement : plus lent quand la CI tourne en parallèle
  await expect(block).toBeVisible({ timeout: 15_000 });
  await block.click();
  await page.getByRole('button', { name: 'Le véhicule est arrivé : créer l’OR' }).click();

  await expect(page).toHaveURL(/\/or\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('link', { name: plate, exact: true })).toBeVisible();
  await expect(page.getByText(`Client planning ${id}`).first()).toBeVisible();
  await expect(page.getByText(/OR créé depuis le rendez-vous du/)).toBeVisible();

  // Au planning, le rendez-vous a laissé place à l'OR, chez Alice.
  await page.goto(`/planning?vue=jour&date=${date}`);
  await expect(page.getByRole('link', { name: new RegExp(`10:00 - 11:30 ${plate}`) })).toBeVisible();
  await expect(page.getByRole('button', { name: `Rendez-vous 10:00 ${plate}` })).toHaveCount(0);
});

test('un OR est placé au planning d’un technicien', async ({ page }, testInfo) => {
  const id = suffix(testInfo);
  const plate = `PLA${id}`;
  const date = workday(8);
  const client = await receptionClient();
  const { data: order, error } = await client.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: `Client assigné ${id}`,
    p_requested_work: 'Freinage',
  });
  if (error) throw error;

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/planning?vue=jour&date=${date}`);
  await page.getByRole('button', { name: 'Assigner un OR à Bruno' }).click();
  const dialog = page.getByRole('dialog', { name: 'Assigner un OR' });
  await dialog
    .getByLabel('Ordre de réparation')
    .selectOption({ label: `${order.number} — ${plate} — Client assigné ${id}` });
  await dialog.getByLabel('Heure de début').fill('14:00');
  await dialog.getByLabel('Heure de fin').fill('16:00');
  await dialog.getByRole('button', { name: 'Assigner au planning' }).click();
  await expect(dialog).toBeHidden();

  const link = page.getByRole('link', { name: new RegExp(`14:00 - 16:00 ${plate}`) });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page.getByText('Technicien : Bruno')).toBeVisible();
});

test('rappel du rendez-vous de demain', async ({ page }, testInfo) => {
  const id = suffix(testInfo);
  const plate = `RAP${id}`;
  const date = parisDay(1);
  const client = await receptionClient();
  const { error } = await client.rpc('save_appointment', {
    p_client_name: `Client rappel ${id}`,
    p_plate: plate,
    p_vehicle_type: 'vul',
    p_scheduled_date: date,
    p_start_time: '08:30',
    p_reason: 'Contrôle',
  });
  if (error) throw error;

  await loginAs(page, 'reception@rts.local');
  await page.goto('/rendez-vous');
  const item = page.getByRole('listitem').filter({ hasText: plate });
  await expect(item).toContainText('Rappel à envoyer');
  await expect(item).toContainText(new RegExp(`Client rappel ${id}.*Contrôle.*à assigner`));
  await item.getByRole('button').click();
  await page.getByRole('button', { name: 'Envoyer un rappel au client' }).click();

  const reminder = page.getByRole('dialog', { name: 'Rappel du rendez-vous' });
  await expect(reminder.getByRole('link', { name: /Envoyer par e-mail/ })).toHaveAttribute(
    'href',
    new RegExp(`${plate}.*Contr%C3%B4le`),
  );
  await page.keyboard.press('Escape');
  await expect(item).toContainText('Rappel envoyé');
});

test('le technicien n’a pas accès au planning du bureau', async ({ page }) => {
  await loginAs(page, 'alice@rts.local');
  await expect(page.getByRole('link', { name: 'Planning', exact: true })).toHaveCount(0);
  await page.goto('/planning');
  await expect(page.getByRole('heading', { name: 'Accès refusé' })).toBeVisible();
});
