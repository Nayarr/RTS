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

async function logout(page: Page) {
  await page.getByRole('button', { name: 'Se déconnecter' }).first().click();
  await expect(page).toHaveURL(/\/connexion$/);
}

/** Devis sans OR, accepté par le client : vidange chiffrée 1,5 h et extincteur (API : réception). */
async function acceptedQuote(plate: string, clientName: string) {
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      auth: { persistSession: false },
    },
  );
  await client.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: quote, error } = await client.rpc('create_quote', {
    p_client_name: clientName,
    p_plate: plate,
    p_vehicle_type: 'pl',
  });
  if (error) throw error;
  const lines = await client.from('quote_lines').insert([
    {
      quote_id: quote.id,
      position: 0,
      line_type: 'labor',
      description: 'Vidange moteur et filtres',
      estimated_hours: 1.5,
      unit_price: 85,
      quantity: 1.5,
    },
    {
      quote_id: quote.id,
      position: 1,
      line_type: 'labor',
      description: 'Remplacement Extincteur 6 kg camion',
      estimated_hours: 0.3,
      unit_price: 85,
      quantity: 0.3,
    },
  ]);
  if (lines.error) throw lines.error;
  const accepted = await client.rpc('set_quote_response', { p_quote_id: quote.id, p_status: 'accepted' });
  if (accepted.error) throw accepted.error;
  return quote.id;
}

test('OR créé depuis un devis : début prévu, travaux au temps du devis, travail non fait retiré', async ({
  page,
}, testInfo) => {
  test.slow();
  const id = `${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-6)}`;
  const plate = `QD${id}`;
  const quoteId = await acceptedQuote(plate, `Client devis OR ${id}`);

  // Bureau : technicien et début prévu choisis à la création
  await loginAs(page, 'reception@rts.local');
  await page.goto(`/devis/${quoteId}`);
  await page.getByRole('button', { name: 'Transformer en OR' }).click();
  const dialog = page.getByRole('dialog', { name: 'Créer l’OR' });
  await dialog.getByLabel('Technicien').selectOption({ label: 'Alice' });
  await dialog.getByLabel('Date').fill(parisDay());
  await dialog.getByLabel('Heure de début').fill('06:00');
  await dialog.getByLabel('Heure de fin').fill('05:00');
  await expect(dialog.getByText('L’heure de fin doit être après l’heure de début')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Créer l’OR' })).toBeDisabled();
  await dialog.getByLabel('Heure de fin').fill('07:30');
  await expect(dialog.getByText(/Le technicien est prévenu à la création/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Créer l’OR' }).click();
  await expect(page.getByRole('heading', { name: 'Fiche OR' })).toBeVisible();
  const orderUrl = page.url();
  await logout(page);

  // Technicien : l'OR est dans sa journée, à 06:00 ; les travaux du devis sont à faire
  await loginAs(page, 'alice@rts.local');
  const card = page
    .getByRole('region', { name: /Aujourd’hui/ })
    .getByRole('link', { name: new RegExp(plate) });
  await expect(card).toContainText('prévu 06:00 → 07:30');
  await card.click();
  const done = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole('heading', { name: 'Travaux effectués' }) });
  const tasks = done.getByRole('textbox', { name: 'Description de la tâche' });
  await expect(tasks).toHaveCount(2);
  await expect(tasks.first()).toHaveValue('Vidange moteur et filtres');
  const times = done.getByRole('combobox', { name: 'Temps réel' });
  // Facturé au temps du devis ; le temps réel reste à saisir par le technicien
  await expect(times.first()).toHaveValue('');
  await expect(times.first()).toHaveAccessibleDescription(
    'Devis : 1,5 h (facturé) — indique le temps réel passé',
  );

  // L'extincteur n'a finalement pas été changé : retiré après confirmation
  await done.getByRole('button', { name: 'Supprimer la tâche' }).nth(1).click();
  const confirm = page.getByRole('dialog', { name: 'Retirer ce travail ?' });
  await expect(confirm).toContainText('Remplacement Extincteur 6 kg camion');
  await confirm.getByRole('button', { name: 'Retirer' }).click();
  await expect(tasks).toHaveCount(1);
  // Le message « Tâche supprimée » couvre l'en-tête sur téléphone : on attend qu'il parte
  await expect(page.getByText('Tâche supprimée')).toBeHidden({ timeout: 10_000 });
  await page.getByRole('link', { name: 'Retour à mes OR' }).click();
  await logout(page);

  // Bureau : retrait visible dans l'historique de l'OR
  await loginAs(page, 'reception@rts.local');
  await page.goto(orderUrl);
  await expect(
    page.getByText('Travail retiré par le technicien (non fait) : Remplacement Extincteur 6 kg camion'),
  ).toBeVisible();
});
