import { createClient } from '@supabase/supabase-js';
import { expect, test, type TestInfo } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';

const env = loadEnv('production', process.cwd(), 'VITE_');
// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';

const suffix = (testInfo: TestInfo) =>
  `${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-7)}`;

test('facture en ligne : conditions générales de vente affichées', async ({ page }, testInfo) => {
  const api = createClient<Database>(env.VITE_SUPABASE_URL ?? '', env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '', {
    auth: { persistSession: false },
  });
  await api.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const plate = `CG${suffix(testInfo)}`;
  const { data: order, error } = await api.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: `Client CGV ${plate}`,
    p_requested_work: 'Freinage',
  });
  if (error) throw error;
  await api
    .from('clients')
    .update({ billing_address: '12 rue des Transporteurs, 95190 Goussainville' })
    .eq('id', order.client_id ?? '');
  await api.from('ro_lines').insert({
    repair_order_id: order.id,
    kind: 'done',
    line_type: 'labor',
    description: 'Contrôle freinage',
    estimated_hours: 1,
  });
  const draft = await api.rpc('build_invoice_draft', { p_repair_order_ids: [order.id] });
  if (draft.error) throw draft.error;
  const issued = await api.rpc('issue_invoice', { p_invoice_id: draft.data });
  if (issued.error) throw issued.error;
  const token = await api.rpc('share_invoice', { p_invoice_id: draft.data });
  if (token.error) throw token.error;

  await page.goto(`/d/${token.data}`);
  await expect(
    page.getByRole('heading', { name: 'Conditions générales de vente et de réparation' }),
  ).toBeVisible();
  await expect(page.getByText(/11\. GARANTIES LÉGALES/)).toBeVisible();
});
