import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';
import { parisDay } from './support/dates';

const env = loadEnv('production', process.cwd(), 'VITE_');
const PASSWORD = 'atelier-dev-2026';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
}

async function signedIn(email: string) {
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      auth: { persistSession: false },
    },
  );
  await client.auth.signInWithPassword({ email, password: PASSWORD });
  return client;
}

const uid = (project: string) => `${String(Date.now()).slice(-6)}${project.includes('mobile') ? 'M' : 'D'}`;

/** Même jour, un an plus tôt (« 2028-03-15 » → « 2027-03-15 »). */
// Un an avant ; le 29 février d'une année bissextile donne le 28 février (comme la base)
const yearBefore = (iso: string) => {
  const rest = iso.slice(4) === '-02-29' ? '-02-28' : iso.slice(4);
  return `${Number(iso.slice(0, 4)) - 1}${rest}`;
};

test('utilitaire : contrôle antipollution proposé un an avant le contrôle technique', async ({
  page,
}, testInfo) => {
  const reception = await signedIn('reception@rts.local');
  const { data: client } = await reception.from('clients').select('id').eq('name', 'Transports E2E').single();
  const plate = `AP${uid(testInfo.project.name)}`;
  const { data: vehicle, error } = await reception
    .from('vehicles')
    .insert({ plate, client_id: client!.id, vehicle_type: 'vul' })
    .select('id')
    .single();
  expect(error).toBeNull();

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/vehicules/${vehicle!.id}`);
  await expect(page.getByRole('heading', { name: plate })).toBeVisible();
  const ct = parisDay(500);
  await page.getByLabel('Contrôle technique').fill(ct);
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Fiche véhicule enregistrée')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Contrôle antipollution')).toHaveValue(yearBefore(ct));
});

test('permis : toutes les catégories proposées', async ({ page }) => {
  await loginAs(page, 'reception@rts.local');
  await page.goto('/clients/nouveau');
  await page.getByRole('radio', { name: /Particulier/ }).click();
  const categories = page.getByRole('group', { name: 'Catégories' });
  for (const category of ['AM', 'A2', 'B1', 'C1E', 'D1E', 'DE']) {
    await expect(categories.getByRole('button', { name: category, exact: true })).toBeVisible();
  }
});

test('lien de prise de rendez-vous inconnu : message clair', async ({ page }) => {
  await page.goto(`/rdv/${'0'.repeat(64)}`);
  await expect(page.getByText(/Ce lien est introuvable ou a expiré/)).toBeVisible();
});

test('direction : rappels et échéances automatiques réglables', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Réglage global : une seule fois');
  await loginAs(page, 'direction@rts.local');
  await page.goto('/reglages');
  await page.getByRole('tab', { name: 'Atelier' }).click();
  const toggle = page.getByRole('switch', { name: 'Rappels et échéances envoyés automatiquement' });
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  try {
    await toggle.click();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Réglages de l’atelier enregistrés')).toBeVisible();
    await page.reload();
    await page.getByRole('tab', { name: 'Atelier' }).click();
    await expect(
      page.getByRole('switch', { name: 'Rappels et échéances envoyés automatiquement' }),
    ).toHaveAttribute('aria-checked', 'false');
  } finally {
    const direction = await signedIn('direction@rts.local');
    await direction.from('app_settings').update({ auto_mails_enabled: true }).eq('id', true);
  }
});
