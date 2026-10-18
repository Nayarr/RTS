import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';
import { sql } from './support/db';

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

test('devis envoyé sans réponse : alerte du dernier jour travaillé, OR en « Facture à faire »', async ({
  page,
}, testInfo) => {
  // Traitement mensuel commun à toute la base : un seul navigateur
  test.skip(testInfo.project.name.includes('mobile'), 'Traitement de fin de mois partagé');
  const id = String(Date.now()).slice(-6);
  const plate = `FM${id}`;
  const reception = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      auth: { persistSession: false },
    },
  );
  await reception.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });

  // OR de diagnostic en attente de devis, devis envoyé au client (lien) sans réponse
  const { data: order, error } = await reception.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: `Client fin de mois ${id}`,
    p_requested_work: 'Diagnostic',
  });
  if (error) throw error;
  const { data: quoteId, error: quoteError } = await reception.rpc('build_quote_from_repair_order', {
    p_repair_order_id: order.id,
  });
  if (quoteError) throw quoteError;
  const line = await reception
    .from('quote_lines')
    .insert({ quote_id: quoteId, description: 'Remplacement disques', unit_price: 300 });
  if (line.error) throw line.error;
  const shared = await reception.rpc('share_quote', { p_quote_id: quoteId });
  if (shared.error) throw shared.error;
  sql(`update public.repair_orders set status = 'quote_pending' where id = '${order.id}'`);

  // Dernier jour travaillé d'un mois à venir, 8 h passées (mois propre au test)
  const year = 2100 + (Number(id) % 800);
  const day = sql(`select public.last_working_day_of_month('${year}-03-01')`);
  expect(Number(sql(`select public.month_end_unsigned_quotes('${day} 09:00 Europe/Paris')`))).toBeGreaterThan(
    0,
  );

  // Direction : alerte dans la cloche, lien vers les devis en attente de réponse
  await loginAs(page, 'direction@rts.local');
  await page.getByRole('button', { name: /^Alertes/ }).click();
  const alert = page
    .getByRole('dialog', { name: 'Alertes' })
    .getByRole('button', { name: /devis envoyés? sans réponse en fin de mois/ })
    .first();
  await expect(alert).toBeVisible();
  await alert.click();
  await expect(page).toHaveURL(/\/devis\?filtre=sent$/);

  // L'OR d'origine est à facturer, avec la trace dans son historique
  await page.goto(`/or/${order.id}`);
  await expect(page.getByText('Facture à faire').first()).toBeVisible();
  await expect(page.getByText(/sans réponse en fin de mois : OR passé en « Facture à faire »/)).toBeVisible();
});
