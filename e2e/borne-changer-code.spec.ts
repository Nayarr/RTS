import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';

const env = loadEnv('production', process.cwd(), 'VITE_');
// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
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

const randomPin = () => String(Math.floor(100000 + Math.random() * 900000));

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
    const pin = randomPin();
    const result = await client.rpc('set_technician_pin', { p_technician_id: data.id, p_pin: pin });
    if (!result.error) return { id: data.id, pin };
    if (result.error.code !== '23505') throw result.error;
  }
}

test('borne : le technicien change son code, puis pointe avec le nouveau', async ({ page }, testInfo) => {
  test.slow();
  const name = `Code ${suffix(testInfo)}`;
  const tech = await createTechnician(name);
  const next = randomPin();

  await loginAs(page, 'borne@rts.local');
  await page.getByRole('button', { name: /Changer mon code/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Changer mon code' });
  await dialog.getByLabel('Code actuel').fill(tech.pin);
  await dialog.getByLabel('Nouveau code', { exact: true }).fill(next);
  await dialog.getByLabel('Nouveau code, encore une fois').fill(next);
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog).toContainText(`C’est fait, ${name}`);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // Le nouveau code pointe le technicien
  const status = page.getByRole('status');
  await expect(status).toHaveText('Tape ton code PIN puis OK');
  for (const digit of next) await page.getByRole('button', { name: digit, exact: true }).click();
  await page.getByRole('button', { name: 'Valider' }).click();
  await expect(status).toContainText(`Bonjour ${name}`, { timeout: 15_000 });
});
