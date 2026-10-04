import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
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

async function signedIn(email: string) {
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      auth: { persistSession: false },
    },
  );
  await client.auth.signInWithPassword({ email, password: PASSWORD });
  return client;
}

const uid = ({ project }: TestInfo) =>
  `${project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-5)}`;

/** Contrat réservé, client avec e-mail (API : réception). */
async function reservedContract(id: string) {
  const api = await signedIn('reception@rts.local');
  const vehicle = await api
    .from('fleet_vehicles')
    .insert({ plate: `RS-${id}`, brand: 'Iveco', model: `Daily ${id}`, category: 'van', daily_rate: 110 })
    .select('id')
    .single();
  if (vehicle.error) throw vehicle.error;
  const client = await api
    .from('clients')
    .insert({ kind: 'pro', name: `Transports Resend ${id}`, email: `compta.${id}@e2e.fr` })
    .select('id')
    .single();
  if (client.error) throw client.error;
  const departure = Date.now() + 24 * 3_600_000;
  const rental = await api
    .from('rentals')
    .insert({
      number: '',
      client_id: client.data.id,
      fleet_vehicle_id: vehicle.data.id,
      departure_at: new Date(departure).toISOString(),
      planned_return_at: new Date(departure + 48 * 3_600_000).toISOString(),
      unit_price: 110,
      periods: 2,
    })
    .select('id, number')
    .single();
  if (rental.error) throw rental.error;
  return rental.data;
}

/**
 * Réglage « envoi par l'appli » vu comme activé par ce navigateur seulement (le réglage de la
 * base reste inchangé pour les autres tests), et service d'envoi simulé : la requête est gardée.
 */
async function simulateMailService(page: Page, response: { status: number; body: unknown }) {
  await page.route('**/rest/v1/app_settings?select=mail_send_enabled*', (route) =>
    route.fulfill({
      json: {
        mail_send_enabled: true,
        mail_domain: 'rapidtruckservice.fr',
        mail_billing_local: 'facturation',
        mail_workshop_local: 'atelier',
        mail_signature_local: 'signature',
      },
    }),
  );
  const requests: Record<string, unknown>[] = [];
  await page.route('**/functions/v1/mail-send', async (route) => {
    requests.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ status: response.status, json: response.body });
  });
  return requests;
}

test('direction : envoi par l’appli activé, domaine et adresses d’envoi réglés', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Réglage global : une seule fois');
  await loginAs(page, 'direction@rts.local');
  await page.goto('/reglages');
  await page.getByRole('tab', { name: 'Atelier' }).click();
  const toggle = page.getByRole('switch', { name: 'Envoyer les e-mails depuis l’appli' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  try {
    await toggle.click();
    await page.getByLabel('Domaine d’envoi').fill('https://rapidtruckservice.fr');
    await page.getByLabel('Adresse facturation').fill('compta');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Domaine seul, ex. rapidtruckservice.fr')).toBeVisible();
    await page.getByLabel('Domaine d’envoi').fill('RapidTruckService.fr');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Réglages de l’atelier enregistrés')).toBeVisible();
    await page.reload();
    await page.getByRole('tab', { name: 'Atelier' }).click();
    await expect(page.getByRole('switch', { name: 'Envoyer les e-mails depuis l’appli' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByLabel('Domaine d’envoi')).toHaveValue('rapidtruckservice.fr');
    await expect(page.getByLabel('Adresse facturation')).toHaveValue('compta');
    await expect(page.getByText('Liens de signature · @rapidtruckservice.fr')).toBeVisible();
  } finally {
    const direction = await signedIn('direction@rts.local');
    await direction
      .from('app_settings')
      .update({ mail_send_enabled: false, mail_domain: null, mail_billing_local: 'facturation' })
      .eq('id', true);
  }
});

test('contrat envoyé par l’appli en un clic, avec le PDF joint', async ({ page }, testInfo) => {
  test.slow();
  const id = uid(testInfo);
  const contract = await reservedContract(id);
  const requests = await simulateMailService(page, { status: 200, body: { id: 're_e2e_1' } });

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/location/contrats/${contract.id}`);
  await page.getByRole('button', { name: 'Envoyer le contrat' }).click();
  const dialog = page.getByRole('dialog', { name: `Envoyer le contrat ${contract.number}` });
  await expect(dialog.getByText('facturation@rapidtruckservice.fr')).toBeVisible();
  await expect(dialog.getByText(/les réponses du client arrivent sur cette adresse/)).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: /Joindre le contrat/ })).toBeChecked();
  await dialog.getByRole('button', { name: 'Envoyer l’e-mail maintenant' }).click();

  await expect(page.getByText(`E-mail envoyé à compta.${id}@e2e.fr`)).toBeVisible({ timeout: 20_000 });
  await expect(dialog).toBeHidden();
  expect(requests).toHaveLength(1);
  const [sent] = requests as [
    {
      category: string;
      to: string;
      subject: string;
      text: string;
      attachments: { filename: string; content: string }[];
    },
  ];
  expect(sent.category).toBe('billing');
  expect(sent.to).toBe(`compta.${id}@e2e.fr`);
  expect(sent.subject).toBe(`Votre contrat de location ${contract.number} — RAPID TRUCK SERVICE`);
  expect(sent.text).toMatch(/\/d\/[0-9a-f]{64}/);
  expect(sent.attachments).toHaveLength(1);
  expect(sent.attachments[0]?.filename).toMatch(/\.pdf$/);
  expect(sent.attachments[0]?.content.startsWith('JVBER')).toBe(true); // « %PDF »
});

test('envoi refusé par le service : message affiché, la messagerie reste proposée', async ({
  page,
}, testInfo) => {
  const id = uid(testInfo);
  const contract = await reservedContract(id);
  await simulateMailService(page, {
    status: 503,
    body: { error: 'Envoi par l’appli pas encore configuré : passe par ta messagerie' },
  });

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/location/contrats/${contract.id}`);
  await page.getByRole('button', { name: 'Envoyer le contrat' }).click();
  const dialog = page.getByRole('dialog', { name: `Envoyer le contrat ${contract.number}` });
  await dialog.getByRole('checkbox', { name: /Joindre le contrat/ }).uncheck();
  await dialog.getByRole('button', { name: 'Envoyer l’e-mail maintenant' }).click();
  await expect(
    page.getByText('Envoi par l’appli pas encore configuré : passe par ta messagerie'),
  ).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('link', { name: /Envoyer par e-mail \(messagerie de l’ordinateur\)/ }),
  ).toBeVisible();
});
