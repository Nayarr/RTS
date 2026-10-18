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

async function api(email: string) {
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

/** 1er du mois, `months` mois après aujourd'hui (heure de Paris). */
function monthFromNow(months: number) {
  const [year, month] = new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
  })
    .format(new Date())
    .split('-')
    .map(Number) as [number, number];
  return new Date(Date.UTC(year, month - 1 + months, 1)).toISOString().slice(0, 10);
}

test('devis avec le contrôle hayon envoyé : échéance du hayon à 6 mois ; renouvellement à la main sur la fiche', async ({
  page,
}, testInfo) => {
  const plate = `HY${String(Date.now()).slice(-6)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;
  const reception = await api('reception@rts.local');
  const { data: quote, error } = await reception.rpc('create_quote', {
    p_client_name: `Client hayon ${plate}`,
    p_plate: plate,
    p_vehicle_type: 'pl',
  });
  if (error) throw error;
  const line = await reception
    .from('quote_lines')
    .insert({ quote_id: quote.id, line_type: 'labor', description: 'Contrôle hayon', unit_price: 65 });
  if (line.error) throw line.error;
  const { data: before } = await reception.from('quotes').select('vehicle_id').eq('id', quote.id).single();
  await reception
    .from('vehicles')
    .update({ tailgate_due_date: '2020-01-01' })
    .eq('id', before?.vehicle_id ?? '');

  // Devis envoyé au client (lien) : le contrôle hayon est refait, échéance dans 6 mois
  const shared = await reception.rpc('share_quote', { p_quote_id: quote.id });
  if (shared.error) throw shared.error;
  const { data: vehicle } = await reception
    .from('vehicles')
    .select('tailgate_due_date')
    .eq('id', before?.vehicle_id ?? '')
    .single();
  expect(vehicle?.tailgate_due_date).toBe(monthFromNow(6));

  // Fiche véhicule : échéance affichée, renouvellement à la main en un clic
  await reception
    .from('vehicles')
    .update({ tailgate_due_date: '2020-01-01' })
    .eq('id', before?.vehicle_id ?? '');
  await loginAs(page, 'reception@rts.local');
  await page.goto(`/vehicules/${before?.vehicle_id}`);
  const month = page.getByLabel(/Contrôle hayon.* : mois$/);
  await expect(month).toHaveValue('01');
  await page.getByRole('button', { name: 'Renouvelé (+6 mois)' }).click();
  const expected = monthFromNow(6);
  await expect(month).toHaveValue(expected.slice(5, 7));
  await expect(page.getByLabel(/Contrôle hayon.* : année$/)).toHaveValue(expected.slice(0, 4));
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Fiche véhicule enregistrée')).toBeVisible();
});
