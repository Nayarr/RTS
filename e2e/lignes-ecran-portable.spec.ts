import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';

const env = loadEnv('production', process.cwd(), 'VITE_');
// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';

test('lignes du devis lisibles sur écran portable : désignation assez large à toutes les tailles', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Tailles d’écran de PC');
  const api = createClient<Database>(env.VITE_SUPABASE_URL ?? '', env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '', {
    auth: { persistSession: false },
  });
  await api.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: quote, error } = await api.rpc('create_quote', {
    p_client_name: 'Transports E2E',
    p_plate: `LP${String(Date.now()).slice(-6)}`,
    p_vehicle_type: 'pl',
  });
  if (error) throw error;
  const added = await api.from('quote_lines').insert({
    quote_id: quote.id,
    position: 0,
    line_type: 'labor',
    description: 'Remplacement plaquettes avant',
    estimated_hours: 1,
    unit_price: 90,
    quantity: 1,
  });
  if (added.error) throw added.error;

  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill('reception@rts.local');
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();
  await page.goto(`/devis/${quote.id}`);

  const designation = page.getByRole('textbox', { name: 'Désignation' });
  await expect(designation).toHaveValue('Remplacement plaquettes avant');
  for (const width of [1024, 1280, 1366, 1440, 1536, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(async () => (await designation.boundingBox())?.width ?? 0, { message: `Écran de ${width} px` })
      .toBeGreaterThan(160);
    await expect(page.getByRole('textbox', { name: 'Prix unit. HT' })).toBeVisible();
    // Une ligne de libellé : pas de texte écrit lettre par lettre
    expect((await designation.boundingBox())?.height ?? 0).toBeLessThan(80);
  }
});
