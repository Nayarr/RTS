import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';

const env = loadEnv('production', process.cwd(), 'VITE_');
const PASSWORD = 'atelier-dev-2026';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
}

/**
 * OR de diagnostic (PL) avec deux travaux déjà faits et une réparation à prévoir,
 * puis devis préparé depuis l'OR : tout par la réception (API), comme l'écran bureau.
 */
async function diagnosticWithQuote(plate: string) {
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
    p_client_name: `Avant devis ${plate}`,
    p_requested_work: 'Bruit au freinage',
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
      description: 'Diagnostic freinage',
      // Expertise d'1 h en tout (avec le contrôle) : facturer ou offrir reste au choix du bureau
      estimated_hours: 0.5,
    },
    {
      repair_order_id: order.id,
      kind: 'done',
      position: 2,
      line_type: 'labor',
      description: 'Contrôle géométrie',
      estimated_hours: 0.5,
    },
    {
      repair_order_id: order.id,
      kind: 'planned',
      position: 3,
      line_type: 'labor',
      description: 'Remplacement disques',
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

test('devis accepté : le bureau facture le diagnostic et offre le contrôle', async ({ page }, testInfo) => {
  const plate = `AD${String(Date.now()).slice(-6)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;
  const { order, quoteId } = await diagnosticWithQuote(plate);

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/devis/${quoteId}`);
  await page.getByRole('button', { name: 'Accepté' }).click();
  await page.getByRole('button', { name: 'Enregistrer l’accord' }).click();

  // La décision s'ouvre toute seule dès l'acceptation, prix proposé = 0,5 h × 90 €/h (taux PL)
  const dialog = page.getByRole('dialog', { name: 'Travaux réalisés avant le devis' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Prix HT de « Diagnostic freinage »')).toHaveValue('45,00');
  await dialog.getByLabel('Prix HT de « Diagnostic freinage »').fill('80');
  await dialog.getByLabel('Décision pour « Contrôle géométrie »').selectOption('offered');
  await dialog.getByRole('button', { name: 'Valider' }).click();

  // Facture séparée émise et ouverte : ligne offerte visible avec 100 % de remise
  await expect(page.getByText(/Facture F\d+ émise \(travaux offerts inclus/)).toBeVisible();
  await expect(page).toHaveURL(/\/factures\/[0-9a-f-]+$/);
  await expect(page.getByText('Contrôle géométrie · offert (geste commercial)')).toBeVisible();

  // L'OR de diagnostic est facturé, plus de bandeau
  await page.goto(`/or/${order.id}`);
  await expect(page.getByText('Facturé').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Facturer / offrir ces travaux' })).toHaveCount(0);
});

test('« Plus tard » laisse le bandeau sur l’OR ; tout offrir ne crée pas de facture', async ({
  page,
}, testInfo) => {
  const plate = `AO${String(Date.now()).slice(-6)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;
  const { order, quoteId } = await diagnosticWithQuote(plate);

  await loginAs(page, 'direction@rts.local');
  await page.goto(`/devis/${quoteId}`);
  await page.getByRole('button', { name: 'Accepté' }).click();
  await page.getByRole('button', { name: 'Enregistrer l’accord' }).click();
  const dialog = page.getByRole('dialog', { name: 'Travaux réalisés avant le devis' });
  await dialog.getByRole('button', { name: 'Plus tard' }).click();
  await expect(dialog).toBeHidden();

  await page.goto(`/or/${order.id}`);
  await page.getByRole('button', { name: 'Facturer / offrir ces travaux' }).click();
  await dialog.getByRole('button', { name: 'Tout offrir' }).click();
  await dialog.getByRole('button', { name: 'Valider' }).click();
  await expect(page.getByText('Travaux offerts enregistrés')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Facturer / offrir ces travaux' })).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/or/${order.id}$`));
});
