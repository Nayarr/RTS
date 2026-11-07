import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';

const env = loadEnv('production', process.cwd(), 'VITE_');
// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';

test('atelier en direct : date et heure prévues de l’opération sur la carte, sur plusieurs jours', async ({
  page,
}, testInfo) => {
  const api = createClient<Database>(env.VITE_SUPABASE_URL ?? '', env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '', {
    auth: { persistSession: false },
  });
  await api.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: alice } = await api.from('technicians').select('id').eq('display_name', 'Alice').single();
  const suffix = `${String(Date.now()).slice(-5)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;
  const create = (plate: string, planned: Partial<Record<string, string>>) =>
    api.rpc('create_repair_order', {
      p_plate: plate,
      p_vehicle_type: 'pl',
      p_client_name: 'Transports E2E',
      p_requested_work: 'Vidange',
      p_technician_id: alice?.id,
      ...planned,
    });
  const several = await create(`PJ${suffix}`, {
    p_planned_date: '2030-03-04',
    p_planned_start: '08:00',
    p_planned_end_date: '2030-03-06',
    p_planned_end: '17:00',
  });
  const unplanned = await create(`SP${suffix}`, {});
  if (several.error) throw several.error;
  if (unplanned.error) throw unplanned.error;

  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill('direction@rts.local');
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();
  await page.goto('/atelier-en-direct');

  const card = page.getByRole('link', { name: `PJ${suffix} · ${several.data.number}` });
  await card.scrollIntoViewIfNeeded();
  await expect(card).toContainText('Prévu : lun. 04/03 08:00 → mer. 06/03 17:00');
  await expect(card.getByText('lun. 04/03 08:00 → mer. 06/03 17:00')).toBeVisible();
  await expect(page.getByRole('link', { name: `SP${suffix} · ${unplanned.data.number}` })).toContainText(
    'Pas de date prévue',
  );
});
