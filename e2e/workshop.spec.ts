import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';

const env = loadEnv('production', process.cwd(), 'VITE_');
const PASSWORD = 'atelier-dev-2026';
// PNG 1×1 : photo factice (assez légère pour ne pas être recompressée).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const REQUIRED_PHOTOS = ['Face avant', 'Côté gauche', 'Côté droit', 'Arrière', 'Tableau de bord'];

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
}

async function logout(page: Page) {
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page).toHaveURL(/\/connexion$/);
}

/** OR créé par la réception et assigné à Alice (API, comme le ferait l'écran bureau). */
async function createOrderForAlice(plate: string) {
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      auth: { persistSession: false },
    },
  );
  await client.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: alice } = await client.from('technicians').select('id').eq('display_name', 'Alice').single();
  const { data, error } = await client.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: 'Transports E2E',
    p_requested_work: 'Bruit au freinage',
    p_technician_id: alice?.id,
  });
  if (error) throw error;
  return data;
}

async function takePhoto(page: Page, label: string) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: label, exact: true }).click();
  await (await chooser).setFiles({ name: `${label}.png`, mimeType: 'image/png', buffer: PNG });
  await expect(page.getByRole('img', { name: label, exact: true })).toBeVisible();
}

test('le technicien réalise un OR de bout en bout, le bureau voit le résultat', async ({
  page,
}, testInfo) => {
  test.slow(); // parcours complet : envois de photos et plusieurs enregistrements
  const plate = `T${String(Date.now()).slice(-8)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;
  const order = await createOrderForAlice(plate);

  // Accueil du technicien : l'OR est signalé comme nouveau
  await loginAs(page, 'alice@rts.local');
  await expect(page.getByRole('heading', { name: 'Mes ordres de réparation' })).toBeVisible();
  const card = page.getByRole('link', { name: new RegExp(plate) });
  await expect(card.getByText('Nouveau')).toBeVisible();
  await card.click();
  await expect(page.getByRole('heading', { name: plate, level: 1 })).toBeVisible();

  // Badgeage bloqué tant que kilométrage et photos manquent
  const start = page.getByRole('button', { name: 'Démarrer le badgeage' });
  await expect(start).toBeDisabled();
  await page.getByLabel('Kilométrage').fill('184320');
  await page.getByLabel('Kilométrage').press('Enter');
  await expect(page.getByText('Kilométrage enregistré')).toBeVisible();
  for (const label of REQUIRED_PHOTOS) await takePhoto(page, label);

  await start.click();
  await expect(page.getByRole('button', { name: 'Mettre en pause' })).toBeVisible();

  // Fiche de contrôle : plaquettes HS → réparation ajoutée aux travaux à prévoir
  await page.getByRole('radiogroup', { name: 'Plaquettes avant' }).getByRole('radio', { name: 'HS' }).click();
  await expect(page.getByRole('textbox', { name: 'Description de la tâche' }).first()).toHaveValue(
    'Remplacement Plaquettes avant',
  );

  // Travaux effectués : une tâche avec son temps
  await page.getByRole('button', { name: 'Ajouter une tâche' }).first().click();
  const doneTask = page.getByRole('textbox', { name: 'Description de la tâche' }).first();
  await expect(doneTask).toHaveValue('');
  await doneTask.fill('Remplacement plaquettes avant');
  await doneTask.blur();
  await page.getByRole('combobox', { name: 'Temps réel' }).first().selectOption('2h');
  await expect(page.getByRole('combobox', { name: 'Temps réel' }).first()).toHaveValue('2h');
  // Tâche à prévoir : son temps estimé aussi, sinon l'OR ne peut pas être terminé
  await page.getByRole('combobox', { name: 'Temps estimé' }).first().selectOption('1h');
  await expect(page.getByRole('combobox', { name: 'Temps estimé' }).first()).toHaveValue('1h');

  // Clôture : pas de devis
  await page.getByRole('group', { name: 'Devis nécessaire ?' }).getByRole('button', { name: 'NON' }).click();
  await page.getByRole('button', { name: 'Travaux terminés' }).click();
  await expect(page.getByRole('heading', { name: 'Mes ordres de réparation' })).toBeVisible();
  await page.getByRole('button', { name: /Voir mes OR terminés/ }).click();
  await expect(
    page.getByRole('link', { name: new RegExp(plate) }).getByText('Terminé atelier'),
  ).toBeVisible();

  // L'OR est verrouillé pour le technicien
  await page.goto(`/atelier/or/${order.id}`);
  await expect(page.getByText('Cet OR est terminé : consultation seulement.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Travaux terminés' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Retour à mes OR' }).click();
  await logout(page);

  // Le bureau voit le résultat : statut, photos, temps déclaré, fiche de contrôle
  await loginAs(page, 'direction@rts.local');
  await page.goto(`/or/${order.id}`);
  await expect(page.getByText('Terminé atelier').first()).toBeVisible();
  const declared = page.getByText('Déclaré', { exact: true }).locator('..');
  await expect(declared.getByText('2 h', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Face avant', exact: true })).toBeVisible();
  await expect(page.getByText('1 point à surveiller.')).toBeVisible();
  await expect(page.getByText('Badgeage démarré')).toBeVisible();
});

test('un technicien n’ouvre pas l’OR d’un collègue', async ({ page }, testInfo) => {
  const plate = `U${String(Date.now()).slice(-8)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;
  const order = await createOrderForAlice(plate);
  await loginAs(page, 'bruno@rts.local');
  await expect(page.getByRole('link', { name: new RegExp(plate) })).toHaveCount(0);
  await page.goto(`/atelier/or/${order.id}`);
  await expect(page.getByRole('heading', { name: 'OR introuvable' })).toBeVisible();
});
