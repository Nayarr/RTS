import { expect, test, type Page } from '@playwright/test';
import { sql } from './support/db';

// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();
}

test('mails reçus vides : la raison du dernier mail ignoré par le tri est affichée', async ({ page }) => {
  // Dernier appel de Resend écrit par l'Edge Function : mail adressé à aucune boîte de l'atelier
  sql(
    `insert into public.inbox_webhook_status (id, received_at, result, recipients, domain)
     values (true, now(), 'not_atelier', array['tri-7f3k@abc.resend.app'], 'rapidtruckservice.fr')
     on conflict (id) do update set received_at = excluded.received_at, result = excluded.result,
       recipients = excluded.recipients, domain = excluded.domain`,
  );
  await page.route('**/rest/v1/inbox_emails?*', (route) => route.fulfill({ json: [] }));

  await loginAs(page, 'direction@rts.local');
  await page.goto('/agent-direction/mails');
  await expect(page.getByText('Aucun mail reçu pour l’instant.')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Dernier mail ignoré' })).toContainText(
    'il n’est adressé à aucune boîte @rapidtruckservice.fr (destinataires : tri-7f3k@abc.resend.app)',
  );
});
