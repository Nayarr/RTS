import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Browser, type Locator, type Page, type TestInfo } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';

const env = loadEnv('production', process.cwd(), 'VITE_');
// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';
const HOUR = 3_600_000;

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();
}

async function reception() {
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      auth: { persistSession: false },
    },
  );
  await client.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  return client;
}

const uid = ({ project }: TestInfo) =>
  `${project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-5)}`;

/** Véhicule de la flotte, client avec e-mail et contrat réservé, créés par la réception (API). */
async function reservedContract(
  api: SupabaseClient<Database>,
  id: string,
  kind: 'rental' | 'loan',
  departure: Date,
) {
  const vehicle = await api
    .from('fleet_vehicles')
    .insert({
      plate: `EN-${id}`,
      brand: 'Renault',
      model: `Master ${id}`,
      category: 'van',
      daily_rate: 95,
      deposit: 1500,
    })
    .select('id')
    .single();
  if (vehicle.error) throw vehicle.error;
  const client = await api
    .from('clients')
    .insert({
      kind: 'individual',
      first_name: 'Julie',
      last_name: `Envoi${id}`,
      name: '',
      email: `julie.${id}@e2e.fr`,
      billing_address: '12 rue des Lilas\n95190 Goussainville',
    })
    .select('id, name')
    .single();
  if (client.error) throw client.error;
  const rental = await api
    .from('rentals')
    .insert({
      number: '',
      kind,
      client_id: client.data.id,
      fleet_vehicle_id: vehicle.data.id,
      departure_at: departure.toISOString(),
      planned_return_at: new Date(departure.getTime() + 48 * HOUR).toISOString(),
      unit_price: 95,
      periods: 2,
      km_included: 500,
      deposit: 1500,
      franchise: 800,
    })
    .select('id, number')
    .single();
  if (rental.error) throw rental.error;
  return { ...rental.data, clientName: client.data.name, plate: `EN-${id}` };
}

/** Nouveau navigateur (le client chez lui), avec les réglages du projet. */
async function newPage(browser: Browser, { project }: TestInfo) {
  const { baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId } =
    project.use;
  const context = await browser.newContext({
    baseURL,
    viewport,
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
    locale,
    timezoneId,
  });
  return { page: await context.newPage(), close: () => context.close() };
}

async function drawSignature(page: Page, pad: Locator) {
  await pad.scrollIntoViewIfNeeded();
  const box = await pad.boundingBox();
  if (!box) throw new Error('Zone de signature introuvable');
  await page.mouse.move(box.x + 30, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 100, { steps: 8 });
  await page.mouse.move(box.x + 220, box.y + 30, { steps: 8 });
  await page.mouse.up();
}

test('client absent : contrat signé à distance, puis envoyé au client', async ({
  page,
  browser,
}, testInfo) => {
  test.slow();
  const id = uid(testInfo);
  const contract = await reservedContract(await reception(), id, 'rental', new Date(Date.now() + 24 * HOUR));

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/location/contrats/${contract.id}`);
  const card = page.getByRole('region', { name: 'Signature du client' });
  await card.getByRole('button', { name: 'Faire signer à distance (e-mail)' }).click();
  const send = page.getByRole('dialog', { name: `${contract.number} : signature à distance` });
  await expect(send.getByLabel('E-mail du client')).toHaveValue(`julie.${id}@e2e.fr`);
  await expect(send.getByRole('link', { name: /Envoyer par e-mail/ })).toHaveAttribute(
    'href',
    new RegExp(
      `^mailto:julie\\.${id}@e2e\\.fr\\?subject=Contrat%20de%20location%20${contract.number}%20%C3%A0%20signer`,
    ),
  );
  const link = await send.getByLabel('Lien', { exact: true }).inputValue();
  await page.keyboard.press('Escape');
  await expect(card.getByText(/Lien de signature envoyé, valable jusqu’au/)).toBeVisible();
  await expect(card.getByRole('button', { name: 'Renvoyer le lien de signature' })).toBeVisible();

  // Le client relit son contrat et le signe chez lui, sans compte
  const client = await newPage(browser, testInfo);
  await client.page.goto(new URL(link).pathname);
  await expect(client.page.getByRole('heading', { name: 'CONTRAT DE LOCATION' })).toBeVisible();
  await expect(client.page.getByText(contract.plate, { exact: true })).toBeVisible();
  await expect(client.page.getByText(/190,00\s€ HT · 228,00\s€ TTC/)).toBeVisible();
  await client.page.getByLabel('Votre nom').fill(contract.clientName);
  await drawSignature(client.page, client.page.getByRole('img', { name: 'Signature du client' }));
  await client.page.getByRole('button', { name: 'Signer le contrat' }).click();
  await expect(client.page.getByRole('alert')).toContainText('Merci de cocher la case');
  await client.page.getByRole('checkbox', { name: /J’ai lu et j’accepte les conditions/ }).check();
  await client.page.getByRole('button', { name: 'Signer le contrat' }).click();
  await expect(client.page.getByText(/Contrat signé\. Merci/)).toBeVisible();
  await expect(client.page.getByText(new RegExp(`Signé par ${contract.clientName} le`))).toBeVisible();
  await client.close();

  // Bureau : le contrat est signé, la signature n'est plus demandée au départ
  await page.reload();
  await expect(page.getByRole('region', { name: 'Signature du client' })).toHaveCount(0);
  await page.goto(`/location/contrats/${contract.id}/depart?etape=4`);
  await expect(page.getByText(/^Signé le /)).toBeVisible();
  await expect(page.getByRole('img', { name: 'Signature du client' })).toBeVisible();

  // Envoi du contrat : lien de consultation, imprimable
  await page.goto(`/location/contrats/${contract.id}`);
  await page.getByRole('button', { name: 'Envoyer le contrat' }).click();
  const share = page.getByRole('dialog', { name: `Envoyer le contrat ${contract.number}` });
  await expect(share.getByRole('link', { name: /Envoyer par e-mail/ })).toHaveAttribute(
    'href',
    new RegExp(`subject=Votre%20contrat%20de%20location%20${contract.number}`),
  );
  const contractLink = await share.getByLabel('Lien', { exact: true }).inputValue();
  const reader = await newPage(browser, testInfo);
  await reader.page.goto(new URL(contractLink).pathname);
  await expect(reader.page.getByRole('heading', { name: 'CONTRAT DE LOCATION' })).toBeVisible();
  await expect(reader.page.getByText(new RegExp(`Signé par ${contract.clientName} le`))).toBeVisible();
  await expect(reader.page.getByRole('button', { name: 'Imprimer / enregistrer en PDF' })).toBeVisible();
  await reader.close();
});

test('tarif modifié après la signature à distance : contrat à signer de nouveau', async ({
  page,
  browser,
}, testInfo) => {
  const id = uid(testInfo);
  const api = await reception();
  const contract = await reservedContract(api, id, 'rental', new Date(Date.now() + 24 * HOUR));
  const request = await api.rpc('request_rental_signature', { p_rental_id: contract.id });
  if (request.error) throw request.error;
  const token = (request.data as { token: string }).token;

  const client = await newPage(browser, testInfo);
  await client.page.goto(`/d/${token}`);
  await client.page.getByLabel('Votre nom').fill(contract.clientName);
  await client.page.getByRole('checkbox', { name: /J’ai lu et j’accepte les conditions/ }).check();
  await drawSignature(client.page, client.page.getByRole('img', { name: 'Signature du client' }));
  await client.page.getByRole('button', { name: 'Signer le contrat' }).click();
  await expect(client.page.getByText(/Contrat signé\. Merci/)).toBeVisible();

  const update = await api.from('rentals').update({ unit_price: 89 }).eq('id', contract.id);
  if (update.error) throw update.error;
  await client.page.reload();
  await expect(client.page.getByText(/L’atelier a modifié le contrat depuis votre signature/)).toBeVisible();
  await client.close();

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/location/contrats/${contract.id}`);
  await expect(
    page
      .getByRole('region', { name: 'Signature du client' })
      .getByRole('button', { name: 'Faire signer à distance (e-mail)' }),
  ).toBeVisible();
});

test('prêt facturé : la facture émise s’envoie depuis le contrat', async ({ page }, testInfo) => {
  const id = uid(testInfo);
  const api = await reception();
  const loan = await reservedContract(api, id, 'loan', new Date(Date.now() - 3 * HOUR));
  for (const [fn, args] of [
    ['start_rental', { p_rental_id: loan.id }],
    ['return_rental', { p_rental_id: loan.id, p_returned_at: new Date().toISOString() }],
  ] as const) {
    const result = await api.rpc(fn, args);
    if (result.error) throw result.error;
  }
  const closed = await api.rpc('close_rental', {
    p_rental_id: loan.id,
    p_lines: [{ description: 'Prêt de véhicule', unit_price: 40, quantity: 1 }],
  });
  if (closed.error) throw closed.error;

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/location/contrats/${loan.id}`);
  const card = page.getByRole('region', { name: /^Facture/ });
  await expect(
    card.getByText('Facture en brouillon : émets-la pour pouvoir l’envoyer au client.'),
  ).toBeVisible();

  const issued = await api.rpc('issue_invoice', { p_invoice_id: closed.data });
  if (issued.error) throw issued.error;
  await page.reload();
  await card.getByRole('button', { name: 'Envoyer au client' }).click();
  const send = page.getByRole('dialog', { name: /^Envoyer la facture F\d+/ });
  await expect(send.getByLabel('E-mail du client')).toHaveValue(`julie.${id}@e2e.fr`);
  await expect(send.getByRole('link', { name: /Envoyer par e-mail/ })).toHaveAttribute(
    'href',
    /subject=Facture%20F\d+/,
  );
});
