import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';
import { sql } from './support/db';

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

const suffix = (testInfo: TestInfo) =>
  `${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-6)}`;

/** Devis en brouillon de 3 lignes à prévoir (API, réception). */
async function quoteWithLines(testInfo: TestInfo) {
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    { auth: { persistSession: false } },
  );
  await client.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const id = suffix(testInfo);
  const { data: quote, error } = await client.rpc('create_quote', {
    p_client_name: `Client ordre ${id}`,
    p_plate: `GL${id}`,
    p_vehicle_type: 'pl',
  });
  if (error) throw error;
  const lines = await client.from('quote_lines').insert(
    ['Diagnostic', 'Vidange', 'Freinage'].map((description, position) => ({
      quote_id: quote.id,
      position,
      line_type: 'labor' as const,
      description,
      unit_price: 90,
      quantity: 1,
    })),
  );
  if (lines.error) throw lines.error;
  return quote.id;
}

const designations = (page: Page) =>
  page
    .getByRole('region', { name: 'Travaux à prévoir' })
    .getByRole('textbox', { name: 'Désignation' })
    .evaluateAll((fields) => fields.map((field) => (field as HTMLTextAreaElement).value));

test('devis : ligne glissée à la souris tout en haut, ordre gardé après rechargement', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Glisser-déposer à la souris : bureau');
  const quoteId = await quoteWithLines(testInfo);
  await loginAs(page, 'reception@rts.local');
  await page.goto(`/devis/${quoteId}`);
  await expect.poll(() => designations(page)).toEqual(['Diagnostic', 'Vidange', 'Freinage']);

  // « Freinage » attrapé par sa poignée et déposé au-dessus de « Diagnostic »
  // Section en haut de l'écran : les trois poignées à portée de souris
  await page
    .getByRole('heading', { name: 'Travaux à prévoir' })
    .evaluate((heading) => heading.scrollIntoView({ block: 'start' }));
  const handle = page.getByRole('button', { name: 'Déplacer Freinage' });
  const target = page.getByRole('button', { name: 'Déplacer Diagnostic' });
  const from = (await handle.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, to.y + to.height / 2 - 10, { steps: 12 });
  await page.mouse.move(to.x + to.width / 2, to.y + 2, { steps: 4 });
  await page.mouse.up();

  await expect.poll(() => designations(page)).toEqual(['Freinage', 'Diagnostic', 'Vidange']);
  await expect
    .poll(() =>
      sql(`select string_agg(description, ',' order by position) from public.quote_lines
           where quote_id = '${quoteId}'`),
    )
    .toBe('Freinage,Diagnostic,Vidange');
  await page.reload();
  await expect.poll(() => designations(page)).toEqual(['Freinage', 'Diagnostic', 'Vidange']);
});
