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

/** OR d'expertise (PL, 90 €/h) : 0,5 h + 1,5 h déjà faites, puis devis préparé depuis l'OR (API : réception). */
async function expertiseWithQuote(plate: string) {
  const reception = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      auth: { persistSession: false },
    },
  );
  await reception.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: order, error } = await reception.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: `Expertise ${plate}`,
    p_requested_work: 'Perte de puissance',
  });
  if (error) throw error;
  // Adresse de facturation : mention obligatoire pour émettre une facture
  await reception
    .from('clients')
    .update({ billing_address: '12 rue des Transporteurs, 95190 Goussainville' })
    .eq('id', order.client_id ?? '');
  const lines = await reception.from('ro_lines').insert([
    {
      repair_order_id: order.id,
      kind: 'done',
      position: 1,
      line_type: 'labor',
      description: 'Lecture valise',
      estimated_hours: 0.5,
    },
    {
      repair_order_id: order.id,
      kind: 'done',
      position: 2,
      line_type: 'labor',
      description: 'Recherche de fuite turbo',
      estimated_hours: 1.5,
    },
    {
      repair_order_id: order.id,
      kind: 'planned',
      position: 3,
      line_type: 'labor',
      description: 'Remplacement durite turbo',
      estimated_hours: 2,
    },
  ]);
  if (lines.error) throw lines.error;
  const { data: quoteId, error: quoteError } = await reception.rpc('build_quote_from_repair_order', {
    p_repair_order_id: order.id,
  });
  if (quoteError) throw quoteError;
  return { order, quoteId };
}

test('expertise de plus d’1 h : facturée moins 1 h, la première heure offerte sur la facture', async ({
  page,
}, testInfo) => {
  test.slow();
  const plate = `EX${String(Date.now()).slice(-6)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;
  const { order, quoteId } = await expertiseWithQuote(plate);

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/devis/${quoteId}`);
  await page.getByRole('button', { name: 'Accepté' }).click();
  await page.getByRole('button', { name: 'Enregistrer l’accord' }).click();

  const dialog = page.getByRole('dialog', { name: 'Travaux réalisés avant le devis' });
  await expect(dialog.getByRole('note')).toContainText('Expertise de 2 h : facturée moins 1 h.');
  // 1re heure : la lecture valise (0,5 h) puis 0,5 h de la recherche de fuite
  await expect(dialog.getByLabel('Décision pour « Lecture valise »')).toBeDisabled();
  await expect(dialog.getByLabel('Décision pour « Lecture valise »')).toHaveValue('offered');
  await expect(dialog.getByLabel('Prix HT de « Lecture valise »')).toHaveCount(0);
  await expect(dialog.getByText('1 h facturée(s), 0,5 h offerte(s) (1re heure d’expertise).')).toBeVisible();
  await expect(dialog.getByLabel('Prix HT de « Recherche de fuite turbo »')).toHaveValue('90,00');
  await dialog.getByRole('button', { name: 'Valider' }).click();

  // Facture : 1 h facturée, l'heure offerte visible avec 100 % de remise
  await expect(page).toHaveURL(/\/factures\/[0-9a-f-]+$/);
  await expect(page.getByText(/^Lecture valise — 1re heure d.expertise offerte$/)).toBeVisible();
  await expect(page.getByText(/^Recherche de fuite turbo — 1re heure d.expertise offerte$/)).toBeVisible();
  await expect(page.getByText(/Total HT\s*90,00\s€/).first()).toBeVisible();

  await page.goto(`/or/${order.id}`);
  await expect(page.getByText(/expertise de 2 h, 1re heure offerte/)).toBeVisible();
});
