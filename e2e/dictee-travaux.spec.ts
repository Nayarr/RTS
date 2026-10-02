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

/** OR assigné à Alice par la réception (API). */
async function orderForAlice(plate: string) {
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      auth: { persistSession: false },
    },
  );
  await client.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: alice } = await client.from('technicians').select('id').eq('display_name', 'Alice').single();
  const { data, error } = await client.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: 'Transports E2E',
    p_requested_work: 'Entretien',
    p_technician_id: alice?.id,
  });
  if (error) throw error;
  return data;
}

/**
 * Micro simulé : le navigateur de test n'a pas de vraie reconnaissance vocale. Le faux module
 * entend « remplacement du filtre à air. » (d'abord en cours, puis la phrase terminée).
 */
async function fakeSpeech(page: Page) {
  await page.addInitScript(() => {
    class FakeRecognition {
      lang = '';
      interimResults = false;
      continuous = false;
      maxAlternatives = 1;
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        const result = (transcript: string, isFinal: boolean) => ({
          resultIndex: 0,
          results: [Object.assign([{ transcript }], { isFinal })],
        });
        setTimeout(() => this.onresult?.(result('remplacement du', false)), 300);
        setTimeout(() => {
          this.onresult?.(result('remplacement du filtre à air.', true));
          this.onend?.();
        }, 1200);
      }
      stop() {
        this.onend?.();
      }
      abort() {}
    }
    Object.assign(window, { SpeechRecognition: FakeRecognition, webkitSpeechRecognition: FakeRecognition });
  });
}

test('dictée : le technicien dit une tâche, elle s’ajoute aux travaux effectués', async ({
  page,
}, testInfo) => {
  const plate = `DI${String(Date.now()).slice(-7)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;
  const order = await orderForAlice(plate);
  await fakeSpeech(page);
  await loginAs(page, 'alice@rts.local');
  await page.goto(`/atelier/or/${order.id}`);

  const done = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole('heading', { name: 'Travaux effectués' }) });
  await done.getByRole('button', { name: 'Dicter une tâche' }).click();
  // Pendant l'écoute : bouton d'arrêt et texte compris en direct
  await expect(done.getByRole('button', { name: 'Arrêter la dictée' })).toBeVisible();
  await expect(done.getByRole('status')).toContainText('« remplacement du »');

  await expect(done.getByRole('textbox', { name: 'Description de la tâche' })).toHaveValue(
    'Remplacement du filtre à air',
  );
  await expect(done.getByRole('button', { name: 'Dicter une tâche' })).toBeVisible();

  // Enregistrée : toujours là après rechargement
  await page.reload();
  await expect(done.getByRole('textbox', { name: 'Description de la tâche' })).toHaveValue(
    'Remplacement du filtre à air',
  );
});
