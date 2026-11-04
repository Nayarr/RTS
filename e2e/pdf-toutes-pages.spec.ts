import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
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

const suffix = (testInfo: TestInfo) =>
  `${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-6)}`;

test('devis de plusieurs pages : toutes les pages à l’aperçu sur téléphone', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name.includes('mobile');
  const id = suffix(testInfo);
  const api = createClient<Database>(env.VITE_SUPABASE_URL ?? '', env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '', {
    auth: { persistSession: false },
  });
  await api.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: quote, error } = await api.rpc('create_quote', {
    p_client_name: `Client pages ${id}`,
    p_plate: `PG${id}`,
    p_vehicle_type: 'pl',
  });
  if (error) throw error;
  const lines = await api.from('quote_lines').insert(
    Array.from({ length: 40 }, (_, position) => ({
      quote_id: quote.id,
      position,
      line_type: 'labor' as const,
      description: `Travaux ${position + 1}`,
      unit_price: 75,
      quantity: 1,
    })),
  );
  if (lines.error) throw lines.error;

  const errors: string[] = [];
  page.on('pageerror', (failure) => errors.push(failure.message));
  await loginAs(page, 'reception@rts.local');
  await page.goto(`/devis/${quote.id}`);
  await page.getByRole('button', { name: 'Générer le PDF' }).click();
  const preview = page.getByRole('dialog', { name: 'Aperçu' });
  await expect(preview).toBeVisible();

  const download = page.waitForEvent('download');
  await preview.getByRole('link', { name: 'Télécharger' }).click();
  const file = await PDFDocument.load(readFileSync(await (await download).path()));
  const count = file.getPageCount();
  expect(count).toBeGreaterThan(1);

  if (mobile) {
    const pages = preview.getByRole('img', { name: /^Page \d+ sur \d+$/ });
    await expect(pages).toHaveCount(count);
    await expect(preview.getByTitle('Aperçu du PDF')).toHaveCount(0);
    // Dernière page atteinte en faisant défiler, et bien dessinée (pas un canevas vide)
    const last = pages.last();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
    await expect
      .poll(() =>
        last.evaluate((canvas) => {
          const element = canvas as HTMLCanvasElement;
          const { data } = element.getContext('2d')!.getImageData(0, 0, element.width, element.height);
          for (let i = 0; i < data.length; i += 4) if (data[i]! < 200) return true;
          return false;
        }),
      )
      .toBe(true);
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/apercu-mobile.png` });
  } else {
    await expect(preview.getByTitle('Aperçu du PDF')).toBeVisible();
  }
  expect(errors).toEqual([]);
});
