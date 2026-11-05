import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';
import { sql } from './support/db';
import { fillNewProClient } from './support/new-client';

// Fausse caméra : la borne prend une photo à chaque pointage.
test.use({
  permissions: ['camera'],
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
});

const env = loadEnv('production', process.cwd(), 'VITE_');
const PASSWORD = 'atelier-dev-2026';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();
}

const suffix = (testInfo: TestInfo) =>
  `${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-6)}`;

async function apiAs(email: string) {
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    { auth: { persistSession: false } },
  );
  await client.auth.signInWithPassword({ email, password: PASSWORD });
  return client;
}

/** OR terminé, prêt à facturer, créé par la réception. */
async function orderToInvoice(id: string) {
  const api = await apiAs('reception@rts.local');
  const { data: order, error } = await api.rpc('create_repair_order', {
    p_plate: `CP${id}`,
    p_vehicle_type: 'pl',
    p_client_name: `Client comptable ${id}`,
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
  return order;
}

/** Toute lecture ou écriture refusée par la base pendant le test (`/rest/v1`). */
function watchRefusals(page: Page) {
  const refused: string[] = [];
  page.on('response', (response) => {
    const url = response.url();
    if (url.includes('/rest/v1/') && response.status() >= 400) {
      refused.push(`${response.status()} ${url.split('/rest/v1/')[1]?.split('?')[0] ?? url}`);
    }
  });
  return refused;
}

test('le comptable arrive sur les factures et ne voit que ses menus', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Menu latéral du bureau');
  await loginAs(page, 'comptable@rts.local');
  await expect(page).toHaveURL(/\/factures$/);

  const nav = page.getByRole('navigation', { name: 'Navigation principale' });
  await nav.getByRole('button', { name: 'Équipe' }).click();
  await nav.getByRole('button', { name: 'Pilotage' }).click();
  for (const label of [
    'Devis',
    'Factures',
    'Avoirs',
    'Pointages',
    'Congés et absences',
    'Relevé d’heures',
    'Statistiques',
    'Trésorerie',
    'Rentabilité',
  ]) {
    await expect(nav.getByRole('link', { name: label, exact: true })).toBeVisible();
  }
  for (const label of [
    'Ordres de réparation',
    'Planning',
    'Clients',
    'Comptes et rôles',
    'Performance',
    'Consommables',
    'Réglages',
  ]) {
    await expect(nav.getByRole('link', { name: label, exact: true })).toHaveCount(0);
  }
});

test('les écrans du bureau et de la direction lui restent fermés', async ({ page }) => {
  await loginAs(page, 'comptable@rts.local');
  for (const path of ['/or', '/planning', '/clients', '/equipe', '/reglages', '/pilotage/performance']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Accès refusé' })).toBeVisible();
  }
});

test('ses écrans se chargent sans refus de la base', async ({ page }) => {
  test.slow();
  const refused = watchRefusals(page);
  await loginAs(page, 'comptable@rts.local');
  for (const [path, heading] of [
    ['/devis', 'Devis'],
    ['/factures', 'Factures'],
    ['/factures/avoirs', 'Avoirs'],
    ['/pointages', 'Pointages'],
    ['/pointages/conges', 'Congés et absences'],
    ['/pointages/releve', 'Relevé d’heures'],
    ['/pilotage/statistiques', 'Pilotage'],
    ['/pilotage/tresorerie', 'Pilotage'],
    ['/pilotage/rentabilite', 'Pilotage'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/^Impossible de charger/)).toHaveCount(0);
  }
  expect(refused).toEqual([]);
});

test('il prépare et émet la facture d’un OR ; paiements, avoirs et relances en lecture', async ({
  page,
}, testInfo) => {
  test.slow();
  const id = suffix(testInfo);
  const order = await orderToInvoice(id);
  const api = await apiAs('comptable@rts.local');
  const { data: invoiceId, error } = await api.rpc('build_invoice_draft', { p_repair_order_ids: [order.id] });
  if (error) throw error;

  const refused = watchRefusals(page);
  await loginAs(page, 'comptable@rts.local');
  await page.goto(`/factures/${invoiceId}`);
  await expect(page.getByText(`Client comptable ${id}`).first()).toBeVisible();
  // Pas de retour vers l'OR : il n'y a pas accès
  await expect(page.getByRole('link', { name: /Retour à l’OR/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: order.number })).toHaveCount(0);

  // Coordonnées de facturation complétées depuis la facture
  await page.getByLabel('SIRET').fill('123 456 789 00015');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByText('Coordonnées du client enregistrées')).toBeVisible();

  await page.getByRole('button', { name: 'Émettre la facture' }).click();
  const confirm = page.getByRole('dialog', { name: 'Émettre définitivement cette facture ?' });
  await confirm.getByRole('button', { name: 'Émettre la facture' }).click();
  await expect(page.getByText(/^F\d+$/)).toBeVisible({ timeout: 15_000 });

  await expect(page.getByRole('button', { name: 'Envoyer au client' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enregistrer un paiement' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Générer un avoir' })).toHaveCount(0);

  // Échéance dépassée : pas de relance pour lui, le paiement saisi par le bureau reste lisible
  sql(
    `set rts.migration = 'on'; update public.invoices set issued_at = now() - interval '40 days',
     due_date = current_date - 30 where id = '${invoiceId}'`,
  );
  const reception = await apiAs('reception@rts.local');
  const paid = await reception
    .from('payments')
    .insert({ invoice_id: invoiceId, amount_ttc: 20, method: 'check' });
  if (paid.error) throw paid.error;
  await page.reload();
  await expect(page.getByText('Chèque').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Relancer', exact: true })).toHaveCount(0);

  // Liste : export comptable oui, relance groupée non
  await page.goto('/factures');
  await expect(page.getByRole('button', { name: 'Exporter' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Relancer les retards' })).toHaveCount(0);

  // PDF de la facture
  await page.goto(`/factures/${invoiceId}`);
  await page.getByRole('button', { name: /PDF/ }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 20_000 });
  await page.waitForLoadState('networkidle');
  expect(refused).toEqual([]);
});

test('il crée un devis pour un nouveau client', async ({ page }, testInfo) => {
  const id = suffix(testInfo);
  const refused = watchRefusals(page);
  await loginAs(page, 'comptable@rts.local');
  await page.goto('/devis/nouveau');
  await page.getByLabel(/^Client/).fill(`Client devis ${id}`);
  await page.getByRole('button', { name: 'Créer le devis' }).click();
  await fillNewProClient(page, `devis-${id.toLowerCase()}@exemple.fr`);
  await page.getByRole('button', { name: 'Créer le devis' }).click();
  await expect(page).toHaveURL(/\/devis\/[0-9a-f-]{36}$/, { timeout: 15_000 });

  // Transformer en OR reste au bureau
  await expect(page.getByRole('heading', { name: 'Actions' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Transformer en OR/ })).toHaveCount(0);
  await page.waitForLoadState('networkidle');
  expect(refused).toEqual([]);
});

test('pointages et congés en lecture seule', async ({ page }) => {
  await loginAs(page, 'comptable@rts.local');
  await page.goto('/pointages');
  await expect(page.getByRole('article').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ajouter une correction' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Borne de pointage' })).toHaveCount(0);

  await page.goto('/pointages/conges');
  await expect(page.getByRole('heading', { name: 'Absences', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ajouter une absence' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Valider' })).toHaveCount(0);

  // Le relevé d'heures s'exporte
  await page.goto('/pointages/releve');
  await expect(page.getByRole('button', { name: /Export CSV/ }).first()).toBeVisible();

  const api = await apiAs('comptable@rts.local');
  const refused = await api.rpc('add_manual_clock_event', {
    p_technician_id: '00000000-0000-0000-0000-000000000000',
    p_work_date: '2026-11-02',
    p_event_type: 'in',
    p_time: '08:00',
    p_reason: 'Essai',
  });
  expect(refused.error?.code).toBe('42501');
});

test('il badge à la borne avec son code PIN, sans colonne au planning', async ({
  page,
  browser,
}, testInfo) => {
  test.slow();
  test.skip(testInfo.project.name.includes('mobile'), 'Borne testée sur le bureau');
  const direction = await apiAs('direction@rts.local');
  const { data: technician, error } = await direction
    .from('technicians')
    .select('id, exclude_from_planning')
    .eq('display_name', 'Camille')
    .single();
  if (error) throw error;
  expect(technician.exclude_from_planning).toBe(true);
  // Test rejouable : sans pointage du jour, le passage à la borne est une arrivée
  sql(`set rts.migration = 'on'; delete from public.clock_events where technician_id = '${technician.id}'`);

  let pin = '';
  for (let attempt = 0; attempt < 5 && !pin; attempt += 1) {
    const candidate = String(Math.floor(100000 + Math.random() * 900000));
    const result = await direction.rpc('set_technician_pin', {
      p_technician_id: technician.id,
      p_pin: candidate,
    });
    if (!result.error) pin = candidate;
  }
  expect(pin).not.toBe('');

  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill('borne@rts.local');
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByText('Borne de pointage')).toBeVisible();
  const status = page.getByRole('status');
  await expect(status).toHaveText('Tape ton code PIN puis OK');
  for (const digit of pin) await page.getByRole('button', { name: digit, exact: true }).click();
  await page.getByRole('button', { name: 'Valider' }).click();
  await expect(status).toContainText('Bonjour Camille', { timeout: 15_000 });

  // Il voit son propre pointage
  const own = await browser.newContext({ timezoneId: 'Europe/Paris' });
  const ownPage = await own.newPage();
  await loginAs(ownPage, 'comptable@rts.local');
  await ownPage.goto('/pointages');
  await expect(ownPage.getByRole('article', { name: 'Camille' }).getByText('Présent')).toBeVisible();
  await own.close();

  // Pas de colonne au planning
  const office = await browser.newContext({ timezoneId: 'Europe/Paris' });
  const officePage = await office.newPage();
  await loginAs(officePage, 'reception@rts.local');
  await officePage.goto('/planning?vue=jour');
  await expect(officePage.getByRole('columnheader').first()).toBeVisible();
  await expect(officePage.getByRole('columnheader', { name: /Camille/ })).toHaveCount(0);
  await office.close();
});

test('la direction crée un compte comptable : fiche de badgeage imposée', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Écran du bureau');
  const id = suffix(testInfo);
  await loginAs(page, 'direction@rts.local');
  await page.goto('/equipe');
  await page.getByRole('button', { name: 'Nouveau compte' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nom complet').fill(`Dominique Compta${id}`);
  await dialog.getByLabel('E-mail de connexion').fill(`compta.${id.toLowerCase()}@rts.local`);
  await dialog.getByRole('combobox', { name: 'Rôle' }).click();
  await page.getByRole('option', { name: /^Comptable/ }).click();
  await expect(dialog.getByRole('checkbox', { name: /fiche technicien/ })).toBeDisabled();
  await expect(dialog.getByRole('checkbox', { name: /fiche technicien/ })).toBeChecked();
});
