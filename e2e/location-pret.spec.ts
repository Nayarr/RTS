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

/** OR d'un client et véhicule de prêt de la flotte (API : réception). */
async function orderAndLoanVehicle(id: string) {
  const reception = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      auth: { persistSession: false },
    },
  );
  await reception.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const order = await reception.rpc('create_repair_order', {
    p_plate: `OR-${id}`,
    p_vehicle_type: 'pl',
    p_client_name: `Transports Courtoisie ${id}`,
    p_requested_work: 'Embrayage',
  });
  if (order.error) throw order.error;
  const vehicle = await reception.from('fleet_vehicles').insert({
    plate: `PR-${id}`,
    brand: 'Peugeot',
    model: `308 ${id}`,
    category: 'car',
    daily_rate: 45,
    mileage: 61200,
  });
  if (vehicle.error) throw vehicle.error;
  return order.data.id;
}

test('prêt depuis la fiche OR : client repris, prêt facturé, suivi sur l’OR', async ({ page }, testInfo) => {
  test.slow();
  const id = `${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-5)}`;
  const orderId = await orderAndLoanVehicle(id);

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/or/${orderId}`);
  const loanCard = page.getByRole('region', { name: 'Véhicule de prêt' });
  await expect(loanCard).toContainText('Aucun véhicule prêté');
  await loanCard.getByRole('link', { name: 'Prêter un véhicule' }).click();

  // Prêt rattaché à l'OR, client de l'OR déjà choisi
  await expect(page.getByRole('radio', { name: /Prêt pendant un OR/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByText('Prêt rattaché à l’OR')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Client' })).toContainText(`Transports Courtoisie ${id}`);
  await page.getByLabel('Date de départ *').fill(parisDay());
  await page.getByLabel('Heure de départ *').fill('08:00');
  await page.getByLabel('Date de retour prévue *').fill(parisDay(2));
  await page.getByRole('radio', { name: new RegExp(`PR-${id}`) }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Prêt PR-\d{4}-\d{4}/);

  // Prêt facturé (sinon gratuit)
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('switch', { name: 'Prêt facturé' }).click();
  await page.getByLabel('Prix HT (€)').fill('30');
  await page.getByRole('button', { name: 'Enregistrer les tarifs' }).click();
  await expect(page.getByText('Tarifs enregistrés')).toBeVisible();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('button', { name: 'Valider et remettre les clés' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('En cours');
  await expect(page.getByRole('region', { name: 'Véhicule' })).toContainText('OR');

  // Fiche OR : le prêt en cours apparaît
  await page.goto(`/or/${orderId}`);
  await expect(loanCard.getByRole('link', { name: new RegExp(`PR-${id}`) })).toContainText('En cours');
});
