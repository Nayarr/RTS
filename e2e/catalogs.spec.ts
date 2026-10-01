import { expect, test, type Page } from '@playwright/test';
import { goTo, sideNav } from './support/nav';

const PASSWORD = 'atelier-dev-2026';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
}

/** Nom unique par projet : desktop et mobile tournent en parallèle sur la même base. */
const unique = (label: string, project: string) =>
  `${label} ${project.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-6)}`;

test('seule la direction gère le stock', async ({ page }) => {
  await loginAs(page, 'reception@rts.local');
  await expect((await sideNav(page)).getByRole('button', { name: 'Stock' })).toHaveCount(0);
  await page.goto('/stock/consommables');
  await expect(page.getByRole('heading', { name: 'Accès refusé' })).toBeVisible();
});

test('consommable : création, réapprovisionnement, inventaire, alerte et retrait', async ({
  page,
}, testInfo) => {
  const name = unique('Huile test', testInfo.project.name);
  await loginAs(page, 'direction@rts.local');
  await goTo(page, 'Stock', 'Consommables');
  await expect(page).toHaveURL(/\/stock\/consommables$/);

  await page.getByRole('button', { name: 'Nouveau consommable' }).click();
  const create = page.getByRole('dialog', { name: 'Nouveau consommable' });
  await create.getByLabel('Nom').fill(name);
  await create.getByLabel('Vente HT / unité').fill('6,50');
  await create.getByLabel('Achat HT / unité').fill('3,20');
  await create.getByLabel('Stock de départ').fill('50');
  await create.getByLabel('Seuil d’alerte').fill('40');
  await create.getByRole('button', { name: 'Enregistrer' }).click();

  const card = page.getByRole('row', { name, exact: true });
  await expect(card.getByText('50 L')).toBeVisible();
  await expect(card.getByText(/6,50/)).toBeVisible();
  await expect(card.getByText(/Stock bas/)).toHaveCount(0);

  await card.getByRole('button', { name: 'Réappro' }).click();
  const restock = page.getByRole('dialog', { name: /Réapprovisionnement/ });
  await restock.getByLabel('Quantité reçue (L)').fill('20,5');
  await restock.getByRole('button', { name: 'Valider' }).click();
  await expect(card.getByText('70,5 L')).toBeVisible();

  // Inventaire sous le seuil : l'alerte apparaît, et reste après rechargement
  await card.getByRole('button', { name: 'Inventaire' }).click();
  const inventory = page.getByRole('dialog', { name: /Inventaire/ });
  await inventory.getByLabel('Stock compté (L)').fill('12');
  await inventory.getByRole('button', { name: 'Valider' }).click();
  await expect(card.getByText('12 L')).toBeVisible();
  await page.reload();
  await expect(card.getByText(/Stock bas \(seuil 40\)/)).toBeVisible();

  await card.getByRole('button', { name: `Retirer ${name}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Retirer' }).click();
  await expect(page.getByText(`${name} supprimé`)).toBeVisible();
  await expect(card).toHaveCount(0);
});

test('catalogue de pièces : ajout avec nouveau fournisseur, recherche, modification, retrait', async ({
  page,
}, testInfo) => {
  const designation = unique('Courroie test', testInfo.project.name);
  await loginAs(page, 'direction@rts.local');
  await page.goto('/stock/pieces');

  await page.getByRole('button', { name: 'Nouvelle pièce' }).click();
  const create = page.getByRole('dialog', { name: 'Nouvelle pièce' });
  await create.getByLabel('Désignation').fill(designation);
  await create.getByLabel('Fournisseur').fill(`Fournisseur ${designation}`);
  await create.getByLabel('Prix d’achat HT (€)').fill('40');
  await create.getByLabel('Prix de vente HT (€)').fill('60');
  await create.getByRole('button', { name: 'Ajouter au catalogue' }).click();
  await expect(page.getByText('Pièce ajoutée au catalogue')).toBeVisible();

  // Recherche côté serveur : les autres pièces disparaissent
  await page.getByRole('searchbox', { name: 'Rechercher une pièce' }).fill(designation);
  await expect(page.getByText('Filtre à huile')).toHaveCount(0);
  // Ligne du tableau (bureau) ou carte (mobile)
  const item = page.locator('tr, [role="article"]').filter({ hasText: designation });
  await expect(item.getByText(`Fournisseur ${designation}`)).toBeVisible();
  await expect(item.getByText('50 %')).toBeVisible();

  await page.getByRole('button', { name: `Modifier ${designation}` }).click();
  const edit = page.getByRole('dialog', { name: 'Modifier la pièce' });
  await expect(edit.getByLabel('Fournisseur')).toHaveValue(`Fournisseur ${designation}`);
  await edit.getByLabel('Prix de vente HT (€)').fill('44');
  await edit.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(item.getByText('10 %')).toBeVisible();

  await page.getByRole('button', { name: `Supprimer ${designation}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Retirer' }).click();
  await expect(page.getByText('Aucune pièce correspondante.')).toBeVisible();
});
