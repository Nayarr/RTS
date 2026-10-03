import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';

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

test('planning : un compte Direction rattaché à une fiche technicien n’a pas de colonne', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Une seule fiche par compte : un seul projet');
  const direction = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    { auth: { persistSession: false } },
  );
  const { data: session } = await direction.auth.signInWithPassword({
    email: 'direction@rts.local',
    password: PASSWORD,
  });
  const name = `Patron ${String(Date.now()).slice(-6)}`;
  const { data: sheet, error } = await direction
    .from('technicians')
    .insert({ profile_id: session.user?.id, display_name: name })
    .select('id')
    .single();
  if (error) throw error;
  try {
    await loginAs(page, 'reception@rts.local');
    await page.goto('/planning?vue=jour');
    const headers = page.getByRole('columnheader');
    await expect(headers.filter({ hasText: 'Alice' })).toHaveCount(1);
    await expect(headers.filter({ hasText: name })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Charge de travail' })).not.toContainText(name);
  } finally {
    await direction.from('technicians').delete().eq('id', sheet.id);
  }
});
