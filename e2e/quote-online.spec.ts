import { createClient } from '@supabase/supabase-js';
import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';

const env = loadEnv('production', process.cwd(), 'VITE_');
const PASSWORD = 'atelier-dev-2026';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
}

/** Devis sans OR avec une ligne, créé par la réception (API). */
async function createQuote(clientName: string) {
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      auth: { persistSession: false },
    },
  );
  await client.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: quote, error } = await client.rpc('create_quote', { p_client_name: clientName });
  if (error) throw error;
  const line = await client
    .from('quote_lines')
    .insert({ quote_id: quote.id, description: 'Géométrie train avant', unit_price: 90, quantity: 1.5 });
  if (line.error) throw line.error;
  return quote;
}

/** Le bureau envoie le devis : lien à signer lu dans la fenêtre d'envoi. */
async function shareQuote(page: Page, quoteId: string) {
  await loginAs(page, 'reception@rts.local');
  await page.goto(`/devis/${quoteId}`);
  await page.getByRole('button', { name: 'Envoyer au client (lien à signer)' }).click();
  const dialog = page.getByRole('dialog', { name: /prêt à envoyer/ });
  await dialog.getByLabel('E-mail du client').fill('compta@client-e2e.fr');
  await dialog.getByLabel('E-mail du client').blur();
  await expect(page.getByText('Coordonnées du client enregistrées')).toBeVisible();
  await expect(dialog.getByRole('link', { name: /Envoyer par e-mail/ })).toHaveAttribute(
    'href',
    /^mailto:compta@client-e2e\.fr\?subject=Devis%20DV\d{5}/,
  );
  const link = await dialog.getByLabel('Lien', { exact: true }).inputValue();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  return new URL(link).pathname;
}

/** Le client ouvre le lien dans son propre navigateur, sans compte. */
async function openAsClient(browser: Browser, path: string, { project }: TestInfo) {
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
  const page = await context.newPage();
  await page.goto(path);
  await expect(page.getByRole('heading', { name: 'DEVIS' })).toBeVisible();
  return { page, close: () => context.close() };
}

test('le client signe et accepte le devis en ligne ; le bureau voit sa signature', async ({
  page,
  browser,
}, testInfo) => {
  test.slow();
  const clientName = `Client en ligne ${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${Date.now()}`;
  const quote = await createQuote(clientName);
  const path = await shareQuote(page, quote.id);

  const client = await openAsClient(browser, path, testInfo);
  await expect(client.page.getByText(clientName)).toBeVisible();
  await expect(client.page.getByLabel('Totaux')).toContainText('162,00 €');

  // Sans signature : refusé
  await client.page.getByLabel('Votre nom').fill('Jean Martin');
  await client.page.getByRole('button', { name: 'J’accepte ce devis' }).click();
  await expect(client.page.getByRole('alert')).toContainText('Merci de signer le devis');

  // Signature au doigt / à la souris
  const box = await client.page.getByRole('img', { name: 'Signature du client' }).boundingBox();
  if (!box) throw new Error('Zone de signature introuvable');
  await client.page.mouse.move(box.x + 30, box.y + 40);
  await client.page.mouse.down();
  await client.page.mouse.move(box.x + 120, box.y + 100, { steps: 8 });
  await client.page.mouse.move(box.x + 220, box.y + 30, { steps: 8 });
  await client.page.mouse.up();
  await client.page.getByRole('button', { name: 'J’accepte ce devis' }).click();
  await expect(client.page.getByText(/Devis accepté par Jean Martin/)).toBeVisible();

  // Le lien ne permet plus de répondre
  await client.page.reload();
  await expect(client.page.getByText(/Devis accepté par Jean Martin/)).toBeVisible();
  await expect(client.page.getByRole('button', { name: 'J’accepte ce devis' })).toHaveCount(0);
  await client.close();

  // Côté bureau : devis accepté, signé en ligne, figé
  await page.reload();
  await expect(page.getByText('Devis accepté par le client : il ne peut plus être modifié.')).toBeVisible();
  await expect(page.getByText(/Accepté le .* en ligne par Jean Martin/)).toBeVisible();
  const signature = page.getByRole('img', { name: 'Signature du client', exact: true });
  await expect(signature).toBeVisible();
  await expect(signature).toHaveJSProperty('complete', true);
  expect(await signature.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
});

test('le client refuse le devis en ligne', async ({ page, browser }, testInfo) => {
  const quote = await createQuote(
    `Client refus ${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${Date.now()}`,
  );
  const path = await shareQuote(page, quote.id);

  const client = await openAsClient(browser, path, testInfo);
  await client.page.getByRole('button', { name: 'Refuser' }).click();
  await client.page.getByRole('dialog').getByRole('button', { name: 'Refuser le devis' }).click();
  await expect(client.page.getByText('Devis refusé.')).toBeVisible();
  await client.close();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Rouvrir le devis' })).toBeVisible();
});

test('un lien inconnu n’affiche rien', async ({ page }) => {
  await page.goto(`/d/${'0'.repeat(64)}`);
  await expect(page.getByText('Ce devis est introuvable ou le lien a expiré.')).toBeVisible();
});
