import { expect, test, type Page } from '@playwright/test';
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

test('devis : main d’œuvre au taux poids lourds puis au taux tôlerie', async ({ page }, testInfo) => {
  const plate = `T${String(Date.now()).slice(-8)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;
  await loginAs(page, 'reception@rts.local');
  await goTo(page, 'Facturation', 'Devis');
  await page.getByRole('link', { name: 'Nouveau devis' }).click();
  await page.getByLabel('Client', { exact: true }).fill(`Client ${plate}`);
  await fillNewProClient(page);
  await page.getByLabel('Immatriculation (facultatif)').fill(plate);
  await page.getByRole('button', { name: 'Créer le devis' }).click();
  await expect(page.getByRole('heading', { name: 'DEVIS', exact: true, level: 2 })).toBeVisible();

  // Taux du véhicule (poids lourd) proposé
  await page.getByRole('button', { name: 'Ajouter de la main d’œuvre' }).click();
  let labor = page.getByRole('dialog', { name: 'Main d’œuvre' });
  await expect(labor.getByLabel('Taux HT (€/h)')).toHaveValue('90');
  await labor.getByLabel('Prestation').fill('Remplacement embrayage');
  await labor.getByLabel('Temps (heures)').fill('1');
  await labor.getByRole('button', { name: 'Ajouter' }).click();
  await expect(page.getByLabel('Totaux')).toContainText('90,00 €');

  // Tôlerie choisie : 80 € HT de l'heure
  await page.getByRole('button', { name: 'Ajouter de la main d’œuvre' }).click();
  labor = page.getByRole('dialog', { name: 'Main d’œuvre' });
  await labor.getByLabel('Taux horaire').selectOption('tolerie');
  await expect(labor.getByLabel('Taux HT (€/h)')).toHaveValue('80');
  await labor.getByLabel('Prestation').fill('Redressage aile avant');
  await labor.getByLabel('Temps (heures)').fill('1');
  await labor.getByRole('button', { name: 'Ajouter' }).click();
  await expect(page.getByLabel('Totaux')).toContainText('170,00 €');
});
