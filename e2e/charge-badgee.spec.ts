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

async function api(email: string) {
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    { auth: { persistSession: false } },
  );
  await client.auth.signInWithPassword({ email, password: PASSWORD });
  return client;
}

test('réception : présence badgée de l’atelier, écart et détail des heures d’un technicien', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Tableau de bord du bureau');
  // Veille par le calendrier de Paris (24 h avant ne suffit pas le jour du changement d'heure)
  const day = parisDay(-1);
  // Hier, Bruno a badgé 08:00 → 09:00 (correction de la direction)
  const direction = await api('direction@rts.local');
  const { data: bruno } = await direction
    .from('technicians')
    .select('id')
    .eq('display_name', 'Bruno')
    .single();
  for (const [type, time] of [
    ['in', '08:00'],
    ['out', '09:00'],
  ] as const) {
    const { error } = await direction.rpc('add_manual_clock_event', {
      p_technician_id: bruno!.id,
      p_event_type: type,
      p_work_date: day,
      p_time: time,
      p_reason: 'Essai e2e : présence badgée',
    });
    if (error) throw error;
  }

  await loginAs(page, 'reception@rts.local');
  const card = page.getByRole('region', { name: 'Charge de travail atelier' });
  await card.getByRole('tab', { name: 'Jour' }).click();
  await card.getByRole('button', { name: 'Période précédente' }).click();
  await expect(card.getByRole('group', { name: 'Présence badgée de l’atelier' })).toContainText(
    'Présence badgée',
  );
  const row = card.getByRole('listitem', { name: 'Bruno' });
  await expect(row).toContainText(/Badgé \d/);

  await row.getByRole('button', { name: 'Détail des heures de Bruno' }).click();
  const dialog = page.getByRole('dialog', { name: 'Heures de Bruno' });
  await expect(dialog).toContainText('Temps déclaré sur les OR');
  await expect(dialog).toContainText('OR planifiés');
  await expect(dialog).toContainText('Badgé');
});
