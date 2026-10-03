import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';
import { parisDay } from './support/dates';

const env = loadEnv('production', process.cwd(), 'VITE_');
// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';
// PNG 1×1 : photo factice (assez légère pour ne pas être recompressée).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();
}

/** Véhicule de la flotte et client créés par l'API (réception). */
async function fixtures(id: string, kind: 'individual' | 'pro') {
  const reception = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      auth: { persistSession: false },
    },
  );
  await reception.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const vehicle = await reception
    .from('fleet_vehicles')
    .insert({
      plate: `LC-${id}`,
      brand: 'Renault',
      model: `Master ${id}`,
      category: 'van',
      daily_rate: 95,
      deposit: 1500,
      mileage: 48210,
      tank_liters: 80,
    })
    .select('id')
    .single();
  if (vehicle.error) throw vehicle.error;
  const client = await reception
    .from('clients')
    .insert(
      kind === 'individual'
        ? { kind, first_name: 'Julie', last_name: `Loc${id}`, name: '' }
        : { kind, name: `Transports Prêt ${id}` },
    )
    .select('id, name')
    .single();
  if (client.error) throw client.error;
  return { clientId: client.data.id, clientName: client.data.name };
}

async function photograph(page: Page, name: RegExp | string) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name }).first().click();
  await (await chooser).setFiles({ name: 'photo.png', mimeType: 'image/png', buffer: PNG });
}

async function inspect(page: Page, mileage: string, fuel: string) {
  for (const side of ['Avant', 'Arrière', 'Côté gauche', 'Côté droit', 'Tableau de bord']) {
    await photograph(page, `Photographier : ${side}`);
    await expect(page.getByRole('img', { name: `Photo : ${side}` })).toBeVisible();
  }
  await page.getByLabel('Kilométrage').fill(mileage);
  await page.getByLabel('Kilométrage').press('Enter');
  await page.getByRole('radiogroup', { name: 'Carburant' }).getByRole('radio', { name: fuel }).click();
  await expect(
    page.getByRole('radiogroup', { name: 'Carburant' }).getByRole('radio', { name: fuel }),
  ).toHaveAttribute('aria-checked', 'true');
}

async function pickClientVehicleDates(page: Page, clientName: string, id: string) {
  await page.getByLabel('Rechercher un client').fill(clientName);
  await page
    .getByRole('list', { name: 'Clients' })
    .getByRole('button', { name: new RegExp(clientName) })
    .click();
  await page.getByLabel('Date de départ *').fill(parisDay(1));
  await page.getByLabel('Heure de départ *').fill('09:30');
  await page.getByLabel('Date de retour prévue *').fill(parisDay(3));
  await page.getByLabel('Heure de retour').fill('18:00');
  await page.getByRole('radio', { name: new RegExp(`LC-${id}`) }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
}

const uid = (name: string) => `${name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-5)}`;

test('location complète : permis scanné, clés refusées tant qu’il manque photos et signature, retour et facture', async ({
  page,
}, testInfo) => {
  test.slow();
  const id = uid(testInfo.project.name);
  const { clientId, clientName } = await fixtures(id, 'individual');

  await loginAs(page, 'reception@rts.local');
  // Permis du client scanné sur sa fiche
  await page.goto(`/clients/${clientId}`);
  await page
    .getByRole('region', { name: /Permis de conduire/ })
    .getByRole('button', { name: 'Scanner le permis' })
    .click();
  const licenseDialog = page.getByRole('dialog', { name: 'Permis de conduire' });
  await photograph(page, /Scanner le recto/);
  await expect(licenseDialog.getByRole('img', { name: 'Recto du permis' })).toBeVisible();
  await photograph(page, /Scanner le verso/);
  await expect(licenseDialog.getByRole('img', { name: 'Verso du permis' })).toBeVisible();
  await licenseDialog.getByLabel('N° de permis').fill('910395200123');
  await licenseDialog.getByLabel('Valable jusqu’au').fill('2033-06-22');
  await licenseDialog.getByRole('button', { name: 'B', exact: true }).click();
  await licenseDialog.getByRole('button', { name: 'Enregistrer le permis' }).click();
  await expect(page.getByRole('region', { name: /Permis de conduire/ })).toContainText('Valide');

  // Étape 1 : client, dates (départ obligatoire), véhicule
  await page.goto('/location/nouvelle');
  await pickClientVehicleDates(page, clientName, id);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Location LC-\d{4}-\d{4}/);
  const contractUrl = page.url().replace(/\/depart.*$/, '');
  const required = page.getByRole('region', { name: 'Obligatoire avant la remise des clés' });

  // Étape 2 : permis du client choisi
  await page.getByRole('radiogroup', { name: 'Conducteur' }).getByRole('radio').first().click();
  await expect(page.getByRole('radiogroup', { name: 'Conducteur' })).toContainText('Conforme');
  await page.getByRole('button', { name: 'Continuer' }).click();
  // Étape 3 : tarifs du véhicule repris
  await expect(page.getByLabel('Prix HT (€)')).toHaveValue('95');
  await page.getByRole('button', { name: 'Continuer' }).click();
  // Étape 4 : état des lieux de départ
  await inspect(page, '48210', 'plein (8/8)');
  await page
    .getByRole('img', { name: 'Schéma du véhicule vu de dessus' })
    .click({ position: { x: 40, y: 30 } });
  await page.getByLabel('Description du dommage').fill('Rayure pare-chocs avant droit');
  await page.getByRole('button', { name: 'Noter' }).click();
  await expect(page.getByText('Rayure pare-chocs avant droit')).toBeVisible();
  await page.getByRole('button', { name: 'Continuer' }).click();

  // Étape 5 : sans signature, les clés ne peuvent pas être remises
  const keys = page.getByRole('button', { name: 'Valider et remettre les clés' });
  await expect(keys).toBeDisabled();
  await expect(required.getByRole('listitem').filter({ hasText: 'Signature du client' })).toBeVisible();
  await page.getByLabel('Le client a lu les conditions générales de location').check();
  const pad = page.getByRole('img', { name: 'Signature du client' });
  const box = await pad.boundingBox();
  if (!box) throw new Error('Zone de signature introuvable');
  await page.mouse.move(box.x + 20, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 80, { steps: 8 });
  await page.mouse.move(box.x + 200, box.y + 40, { steps: 8 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Enregistrer la signature' }).click();
  await expect(page.getByText(/Signé le/)).toBeVisible();
  await expect(keys).toBeEnabled();
  await keys.click();

  // Fiche : location en cours
  await expect(page.getByRole('heading', { level: 1 })).toContainText('En cours');
  expect(page.url()).toBe(contractUrl);

  // Retour : photos obligatoires, puis frais et facture
  await page.getByRole('link', { name: 'Enregistrer le retour' }).click();
  const back = page.getByRole('button', { name: /Enregistrer le retour/ });
  await expect(back).toBeDisabled();
  await inspect(page, '48500', '5/8 (5/8)');
  await expect(back).toBeEnabled();
  await back.click();
  const lines = page.getByRole('region', { name: 'Lignes de la facture' });
  await expect(lines.getByRole('textbox', { name: 'Désignation' }).first()).toHaveValue(
    new RegExp(`Location Renault Master ${id}`),
  );
  await expect(lines.getByRole('textbox', { name: 'Désignation' }).nth(1)).toHaveValue('Carburant manquant');
  await expect(page.getByRole('region', { name: 'Total' })).toContainText(/351,00/);
  await page.getByRole('button', { name: 'Créer la facture' }).click();
  await expect(page).toHaveURL(/\/factures\//);
  await expect(page.getByText('Carburant manquant').first()).toBeVisible();
});

test('prêt pendant un OR : clés remises sans permis ni photos, clôturé sans facture', async ({
  page,
}, testInfo) => {
  test.slow();
  const id = uid(testInfo.project.name);
  const { clientName } = await fixtures(id, 'pro');

  await loginAs(page, 'reception@rts.local');
  await page.goto('/location/contrats');
  await page.getByRole('link', { name: 'Prêter un véhicule' }).click();
  await expect(page.getByRole('radio', { name: /Prêt pendant un OR/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await pickClientVehicleDates(page, clientName, id);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Prêt PR-\d{4}-\d{4}/);
  for (let step = 0; step < 3; step += 1) await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('button', { name: 'Valider et remettre les clés' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('En cours');

  await page.getByRole('link', { name: 'Enregistrer le retour' }).click();
  await page.getByRole('button', { name: /Enregistrer le retour/ }).click();
  await page.getByRole('button', { name: 'Clôturer sans facture' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Clôturée');
});
