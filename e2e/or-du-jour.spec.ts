import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';
import { parisDay } from './support/dates';

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

/** OR assigné à Alice par la réception, à une date et une heure données (API, comme le planning). */
async function orderForAlice(plate: string, planned?: { date: string; start: string; end?: string }) {
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      auth: { persistSession: false },
    },
  );
  await client.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: alice } = await client.from('technicians').select('id').eq('display_name', 'Alice').single();
  const { error } = await client.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: 'Transports E2E',
    p_requested_work: `Travaux ${plate}`,
    p_technician_id: alice?.id,
    p_planned_date: planned?.date,
    p_planned_start: planned?.start,
    p_planned_end: planned?.end,
  });
  if (error) throw error;
}

test('technicien : seulement les OR du jour, les reportés, triés par heure, et les flexibles', async ({
  page,
}, testInfo) => {
  const id = `${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-6)}`;
  const plates = {
    tomorrow: `JT${id}`,
    yesterday: `JY${id}`,
    at15: `JB${id}`,
    at7: `JA${id}`,
    flexible: `JF${id}`,
  };
  await orderForAlice(plates.tomorrow, { date: parisDay(1), start: '06:00' });
  await orderForAlice(plates.yesterday, { date: parisDay(-1), start: '14:00', end: '16:00' });
  await orderForAlice(plates.at15, { date: parisDay(0), start: '15:00', end: '17:00' });
  await orderForAlice(plates.at7, { date: parisDay(0), start: '06:30', end: '07:00' });
  await orderForAlice(plates.flexible);

  await loginAs(page, 'alice@rts.local');
  await expect(page.getByRole('heading', { name: 'Mes ordres de réparation' })).toBeVisible();
  const card = (plate: string) => page.getByRole('link', { name: new RegExp(plate) });

  // Pas terminé hier : reporté aujourd'hui, avec sa date d'origine
  const carried = page.getByRole('region', { name: /À terminer/ });
  await expect(carried.getByRole('link', { name: new RegExp(plates.yesterday) })).toContainText(
    `prévu le ${parisDay(-1).slice(8, 10)}/${parisDay(-1).slice(5, 7)} 14:00 → 16:00`,
  );

  // Du jour, à heure fixe : par heure de début (06:30 avant 15:00, quelle que soit la création)
  const today = page.getByRole('region', { name: /Aujourd’hui/ });
  const todayPlates = await today.getByRole('link').allTextContents();
  const at7 = todayPlates.findIndex((text) => text.includes(plates.at7));
  const at15 = todayPlates.findIndex((text) => text.includes(plates.at15));
  expect(at7).toBeGreaterThanOrEqual(0);
  expect(at15).toBeGreaterThan(at7);
  await expect(card(plates.at7)).toContainText('prévu 06:30 → 07:00');

  // Sans heure : catégorie flexible
  await expect(
    page.getByRole('region', { name: /Flexible/ }).getByRole('link', { name: new RegExp(plates.flexible) }),
  ).toBeVisible();

  // Prévu demain : pas encore affiché
  await expect(card(plates.tomorrow)).toHaveCount(0);
});
