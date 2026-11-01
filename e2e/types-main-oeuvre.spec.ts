import { expect, test, type Page } from '@playwright/test';
import { sql } from './support/db';
import { goTo } from './support/nav';
import { fillNewProClient } from './support/new-client';

// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();
}

test('type de main d’œuvre ajouté dans les réglages, utilisé sur un devis puis supprimé', async ({
  page,
}, testInfo) => {
  const id = `${String(Date.now()).slice(-5)}${Math.floor(Math.random() * 90 + 10)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;
  const label = `Électricité ${id}`;

  await loginAs(page, 'direction@rts.local');
  await page.goto('/reglages');
  await page.getByRole('tab', { name: 'Taux horaires' }).click();
  await page.getByLabel('Nouveau type : catégorie').fill(label);
  await page.getByLabel('Nouveau type : libellé sur les documents').fill('Main d’œuvre électricité');
  await page.getByLabel('Nouveau type : taux HT (€/h)').fill('95');
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(page.getByLabel(`Taux HT (€/h) : ${label}`)).toHaveValue('95');
  // Taux de base : pas de suppression
  await expect(page.getByRole('button', { name: 'Supprimer le type : PL' })).toHaveCount(0);

  // Devis : le type est proposé avec son prix
  const plate = `EL${id}`;
  await goTo(page, 'Facturation', 'Devis');
  await page.getByRole('link', { name: 'Nouveau devis' }).click();
  await page.getByLabel('Client', { exact: true }).fill(`Client ${plate}`);
  await fillNewProClient(page);
  await page.getByLabel('Immatriculation (facultatif)').fill(plate);
  await page.getByRole('button', { name: 'Créer le devis' }).click();
  await expect(page.getByRole('heading', { name: 'DEVIS', exact: true, level: 2 })).toBeVisible();
  await page.getByRole('button', { name: 'Ajouter de la main d’œuvre' }).click();
  const labor = page.getByRole('dialog', { name: 'Main d’œuvre' });
  const rateId = sql(`select id from public.labor_rates where label = '${label}'`);
  await labor.getByLabel('Taux horaire').selectOption(rateId);
  await expect(labor.getByLabel('Taux HT (€/h)')).toHaveValue('95');
  await labor.getByLabel('Prestation').fill('Recherche de panne électrique');
  await labor.getByLabel('Temps (heures)').fill('1');
  await labor.getByRole('button', { name: 'Ajouter' }).click();
  await expect(page.getByLabel('Totaux')).toContainText('95,00 €');

  // Supprimé : plus proposé, le devis garde son prix
  await page.goto('/reglages');
  await page.getByRole('tab', { name: 'Taux horaires' }).click();
  await page.getByRole('button', { name: `Supprimer le type : ${label}` }).click();
  await page
    .getByRole('dialog', { name: 'Supprimer ce type de main d’œuvre ?' })
    .getByRole('button', { name: 'Supprimer' })
    .click();
  await expect(page.getByLabel(`Taux HT (€/h) : ${label}`)).toHaveCount(0);
  expect(sql(`select count(*) from public.labor_rates where label = '${label}'`)).toBe('0');
});
