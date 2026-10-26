import { expect, test, type Page } from '@playwright/test';
import { sideNav } from './support/nav';

// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();
}

test('menu : « Mails reçus » sous Agent Direction ; pendant la réponse, trois points animés', async ({
  page,
}) => {
  // Réponse de l'agent lente : le temps de voir l'attente
  let answer: () => void = () => undefined;
  const answered = new Promise<void>((resolve) => (answer = resolve));
  await page.route('**/functions/v1/agent', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.briefing) return route.fulfill({ status: 503, json: { error: 'Point du jour indisponible' } });
    await answered;
    await route.fulfill({ status: 503, json: { error: 'Assistant indisponible pour le moment' } });
  });
  await loginAs(page, 'direction@rts.local');

  await (await sideNav(page)).getByRole('link', { name: 'Mails reçus' }).click();
  await expect(page).toHaveURL(/\/agent-direction\/mails$/);

  await page.goto('/agent-direction');
  await page.getByRole('button', { name: 'Écrire la question' }).click();
  await page.getByLabel('Question à l’agent').fill('Combien de factures en retard ?');
  await page.getByRole('button', { name: 'Envoyer la question' }).click();
  const waiting = page.getByRole('status').filter({ hasText: 'L’agent réfléchit' });
  await expect(waiting).toBeVisible();
  await expect(waiting.locator('.agent-thinking > span')).toHaveCount(3);
  await expect(page.getByText('Je regarde les chiffres')).toHaveCount(0);
  answer();
  await expect(waiting).toHaveCount(0);
});
