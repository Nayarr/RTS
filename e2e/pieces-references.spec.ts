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

test('devis : fiche modifiée en nouvelle référence, ancienne intacte, groupées dans le stock et la recherche', async ({
  page,
}, testInfo) => {
  const id = suffix(testInfo);
  const api = createClient<Database>(env.VITE_SUPABASE_URL ?? '', env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '', {
    auth: { persistSession: false },
  });
  await api.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: quote, error } = await api.rpc('create_quote', {
    p_client_name: `Client pièce ${id}`,
    p_plate: `PR${id}`,
    p_vehicle_type: 'pl',
  });
  if (error) throw error;
  const designation = `Filtre ${id}`;
  const oem = `50-${id}`;
  const first = `MANN-${id}`;
  const second = `HENGST-${id}`;

  await loginAs(page, 'direction@rts.local');
  await page.goto(`/devis/${quote.id}`);

  // Pièce ajoutée au devis
  await page.getByRole('button', { name: 'Ajouter une pièce' }).first().click();
  let dialog = page.getByRole('dialog', { name: 'Ajouter une pièce' });
  await dialog.getByLabel('Désignation').fill(designation);
  await dialog.getByLabel('Réf. fabricant').fill(first);
  await dialog.getByLabel('Réf. constructeur').fill(oem);
  await dialog.getByLabel('Marque').fill('Mann');
  await dialog.getByLabel('Prix d’achat HT (€)').fill('20');
  await dialog.getByLabel('Prix de vente HT (€)').fill('30');
  await dialog.getByRole('button', { name: 'Ajouter la pièce' }).click();
  await expect(dialog).toBeHidden();

  // Fiche ouverte depuis la ligne : autre référence fabricant et autre marque
  await page.getByRole('button', { name: `Modifier la fiche de ${designation}` }).click();
  dialog = page.getByRole('dialog', { name: 'Fiche de la pièce' });
  await expect(dialog.getByLabel('Réf. constructeur')).toHaveValue(oem);
  await dialog.getByLabel('Réf. fabricant').fill(second);
  await dialog.getByLabel('Marque').fill('Hengst');
  await dialog.getByLabel('Prix de vente HT (€)').fill('28');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Nouvelle pièce ajoutée à la base, l’ancienne ne change pas')).toBeVisible();

  // Deux fiches : l'ancienne n'a pas bougé, la ligne pointe sur la nouvelle
  await expect
    .poll(() =>
      sql(`select string_agg(manufacturer_ref || '=' || sale_price, ',' order by sale_price desc)
           from public.parts where designation = '${designation}'`),
    )
    .toBe(`${first}=30.00,${second}=28.00`);
  await expect
    .poll(() =>
      sql(`select p.manufacturer_ref from public.quote_lines l join public.parts p on p.id = l.part_id
           where l.quote_id = '${quote.id}'`),
    )
    .toBe(second);

  // Stock : une pièce, deux références ; retrouvée par l'une ou l'autre
  await page.goto('/stock/pieces');
  await page
    .getByRole('searchbox', { name: 'Rechercher une pièce' })
    .fill(second.toLowerCase().replace('-', ' '));
  await expect(page.getByRole('row', { name: designation, exact: true })).toContainText('2 références');
  await expect(page.getByRole('row', { name: `${designation} ${first}` })).toBeVisible();
  await expect(page.getByRole('row', { name: `${designation} ${second}` })).toBeVisible();

  // Recherche sur un devis : l'équivalente est proposée
  await page.goto(`/devis/${quote.id}`);
  await page.getByRole('button', { name: 'Ajouter une pièce' }).first().click();
  dialog = page.getByRole('dialog', { name: 'Ajouter une pièce' });
  await dialog.getByLabel('Désignation').fill(first);
  const suggestions = dialog.getByRole('list', { name: 'Pièces de la base' });
  await expect(suggestions.getByRole('button')).toHaveCount(2);
  await expect(suggestions).toContainText(second);
});
