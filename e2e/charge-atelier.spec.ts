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

/** Temps saisi aujourd'hui par Alice sur un OR (API : la technicienne déclare 2,5 h). */
async function aliceDeclaresToday(plate: string) {
  const reception = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      auth: { persistSession: false },
    },
  );
  await reception.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: alice } = await reception
    .from('technicians')
    .select('id')
    .eq('display_name', 'Alice')
    .single();
  const { data: order, error } = await reception.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: 'Transports Charge',
    p_requested_work: 'Freins',
    p_technician_id: alice?.id,
  });
  if (error) throw error;
  const line = await reception.from('ro_lines').insert({
    repair_order_id: order.id,
    kind: 'done',
    line_type: 'labor',
    description: 'Disques',
    estimated_hours: 2.5,
  });
  if (line.error) throw line.error;
}

test('charge de travail atelier : jour, semaine, mois, navigation, déclaré par technicien', async ({
  page,
}, testInfo) => {
  await aliceDeclaresToday(
    `CH${String(Date.now()).slice(-6)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`,
  );
  await loginAs(page, 'reception@rts.local');
  await page.goto('/');
  const card = page.getByRole('region', { name: 'Charge de travail atelier' });
  await expect(card.getByText(/^Semaine du /)).toBeVisible();
  await expect(card.getByText(/déclarées sur .* disponibles · \d+ % · .* planifiées/)).toBeVisible();

  const alice = card.getByRole('listitem', { name: 'Alice' });
  await expect(alice).toContainText(/OR travaillés? · planifié/);
  await expect(alice.getByRole('meter', { name: 'Charge de Alice' })).toBeVisible();

  // Jour : le temps saisi aujourd'hui compte aujourd'hui
  await card.getByRole('tab', { name: 'Jour' }).click();
  await expect(card.getByRole('tab', { name: 'Jour' })).toHaveAttribute('aria-selected', 'true');
  const declaredToday = await alice.locator('b.num').first().textContent();
  expect(Number((declaredToday ?? '0').replace(/[^\d,]/g, '').replace(',', '.'))).toBeGreaterThanOrEqual(2.5);

  // Navigation : la veille, puis retour à aujourd'hui
  await card.getByRole('button', { name: 'Période précédente' }).click();
  await expect(card.getByRole('button', { name: 'Aujourd’hui' })).toBeVisible();
  await card.getByRole('button', { name: 'Aujourd’hui' }).click();
  await expect(card.getByRole('button', { name: 'Aujourd’hui' })).toHaveCount(0);

  // Mois : libellé « Octobre 2026 »
  await card.getByRole('tab', { name: 'Mois' }).click();
  const month = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${parisDay()}T12:00:00Z`),
  );
  await expect(card.getByText(month.charAt(0).toUpperCase() + month.slice(1), { exact: true })).toBeVisible();
  await expect(card.getByText(/^À planifier ou en retard : \d+ OR/)).toBeVisible();
});
