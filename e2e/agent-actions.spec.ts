import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { jsPDF } from 'jspdf';
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

function client() {
  return createClient<Database>(env.VITE_SUPABASE_URL ?? '', env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '', {
    auth: { persistSession: false },
  });
}

const uid = (project: string) => `${String(Date.now()).slice(-6)}${project.includes('mobile') ? 'M' : 'D'}`;

/** Petit manuel d'atelier en PDF (texte réel, lu par la fonction knowledge-ingest). */
function manualPdf(): Buffer {
  const doc = new jsPDF();
  doc.text('Voyant de pression d huile allume : controler le niveau puis le capteur de pression.', 10, 20);
  doc.addPage();
  doc.text('Remplacement des plaquettes de frein avant : couple de serrage des etriers.', 10, 20);
  return Buffer.from(doc.output('arraybuffer'));
}

test('documentation technique : un PDF ajouté est découpé en passages, puis retiré', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Réglage de la direction : une seule fois');
  const title = `Manuel essai ${uid(testInfo.project.name)}`;
  await loginAs(page, 'direction@rts.local');
  await page.goto('/documentation');
  await page.getByLabel('Titre (facultatif)').fill(title);
  await page.getByLabel('Fichier PDF').setInputFiles({
    name: 'manuel.pdf',
    mimeType: 'application/pdf',
    buffer: manualPdf(),
  });
  await expect(page.getByText(/Document ajouté : 2 pages/)).toBeVisible({ timeout: 20_000 });
  const row = page.getByRole('row', { name: title });
  await expect(row).toContainText('Prêt');

  await page.getByRole('button', { name: `Supprimer ${title}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Retirer' }).click();
  await expect(row).toHaveCount(0);
});

test('fiche OR du mécanicien : aide au diagnostic proposée', async ({ page }, testInfo) => {
  const plate = `DG${uid(testInfo.project.name)}`;
  const reception = client();
  await reception.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: alice } = await reception
    .from('technicians')
    .select('id')
    .eq('display_name', 'Alice')
    .single();
  const { error } = await reception.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: `Diagnostic ${plate}`,
    p_requested_work: 'Voyant huile',
    p_technician_id: alice?.id,
  });
  expect(error).toBeNull();

  await loginAs(page, 'alice@rts.local');
  await page.getByRole('link', { name: new RegExp(plate) }).click();
  await page.getByRole('button', { name: 'Aide au diagnostic' }).click();
  const dialog = page.getByRole('dialog', { name: 'Aide au diagnostic' });
  await expect(dialog.getByRole('button', { name: /Demander des pistes/ })).toBeDisabled();
  await dialog.getByLabel('Symptômes').fill('Voyant de pression d’huile allumé au ralenti');
  await expect(dialog.getByRole('button', { name: /Demander des pistes/ })).toBeEnabled();
});
