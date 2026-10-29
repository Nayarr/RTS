import { createClient } from '@supabase/supabase-js';
import { expect, test, type TestInfo } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';
import { sql } from './support/db';

const env = loadEnv('production', process.cwd(), 'VITE_');
// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';

async function signIn(email: string) {
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      auth: { persistSession: false },
    },
  );
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return client;
}

const uniquePlate = (testInfo: TestInfo) =>
  `PD${String(Date.now()).slice(-6)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;

/** Titres des push mis en file pour la direction sur cet OR (envoyés ou non). */
const directionPushes = (orderId: string) =>
  sql(`select string_agg(o.title, ' | ' order by o.created_at) from public.push_outbox o
       join public.profiles p on p.id = o.profile_id
       where p.email = 'direction@rts.local' and o.tag = 'ro-work-${orderId}'`);

test('direction prévenue en push : OR commencé, en pause, repris, travaux terminés', async ({
  page: _page,
}, testInfo) => {
  test.slow();
  const plate = uniquePlate(testInfo);
  const endpoint = `https://push.example/direction-${plate}`;
  // Appareil de la direction abonné (le vrai service de push n'est pas joint en test)
  sql(`insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth_key)
       select id, '${endpoint}', 'p', 'a' from public.profiles where email = 'direction@rts.local'`);
  try {
    const reception = await signIn('reception@rts.local');
    const { data: alice } = await reception
      .from('technicians')
      .select('id')
      .eq('display_name', 'Alice')
      .single();
    const { data: order, error } = await reception.rpc('create_repair_order', {
      p_plate: plate,
      p_vehicle_type: 'pl',
      p_client_name: `Push ${plate}`,
      p_requested_work: 'Freins avant',
      p_technician_id: alice?.id,
    });
    if (error) throw error;
    // Photos obligatoires et temps de la mission (saisis par le technicien dans l'appli)
    sql(`with labels(label) as (values ('Face avant'), ('Côté gauche'), ('Côté droit'), ('Arrière'),
                                        ('Tableau de bord'), ('Contrôle technique')),
              photos as (insert into public.files (storage_key, category, mime_type, size_bytes, uploaded_at)
                         select 'e2e/' || gen_random_uuid(), 'ro_photo', 'image/png', 100, now() from labels
                         returning id),
              numbered as (select id, row_number() over () as n from photos),
              named as (select label, row_number() over () as n from labels)
         insert into public.ro_photos (repair_order_id, file_id, label)
         select '${order.id}', numbered.id, named.label from numbered join named using (n)`);
    sql(
      `update public.ro_lines set estimated_hours = 1 where repair_order_id = '${order.id}' and kind = 'done'`,
    );

    const tech = await signIn('alice@rts.local');
    const step = async (call: PromiseLike<{ error: { message: string } | null }>, expected: string) => {
      const { error: stepError } = await call;
      if (stepError) throw new Error(stepError.message);
      await expect.poll(() => directionPushes(order.id)).toContain(expected);
    };
    await step(tech.rpc('start_timer', { p_repair_order_id: order.id }), `OR commencé : ${plate}`);
    await step(tech.rpc('stop_timer', { p_repair_order_id: order.id }), `OR en pause : ${plate}`);
    await step(tech.rpc('start_timer', { p_repair_order_id: order.id }), `OR repris : ${plate}`);
    await step(
      tech.rpc('complete_repair_order', { p_repair_order_id: order.id, p_quote_needed: false }),
      `Travaux terminés : ${plate}`,
    );
    // Contenu : technicien, numéro de l'OR et tâche, ouvre la fiche OR
    const done = sql(`select body || ' > ' || link from public.push_outbox where tag = 'ro-work-${order.id}'
                      and title like 'Travaux terminés%'`);
    expect(done).toMatch(/^Alice · OR\d{5} · Freins avant > /);
    expect(done).toContain(`/or/${order.id}`);
  } finally {
    sql(`delete from public.push_subscriptions where endpoint = '${endpoint}'`);
  }
});
