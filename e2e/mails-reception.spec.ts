import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { sql } from './support/db';
import { goTo } from './support/nav';

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
  `${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-7)}`;

test('réception : mail reçu ouvert depuis le menu, lu puis coché traité', async ({ page }, testInfo) => {
  const id = suffix(testInfo);
  const subject = `Devis freins ${id}`;
  // Copie d'un mail reçu, triée par l'agent (écrite par l'Edge Function mail-inbox)
  const mailId = sql(`insert into public.inbox_emails
      (provider_id, mailbox, from_name, from_address, subject, body, received_at, triage_status, category,
       urgency, summary, needs_reply)
    values ('e2e-${id}', 'atelier@rapidtruckservice.fr', 'Paul Garnier ${id}', 'paul.${id.toLowerCase()}@exemple.fr',
            '${subject}', 'Bonjour, pouvez-vous chiffrer les freins avant de mon porteur ?', now(), 'done', 'devis',
            'normale', 'Paul Garnier demande un devis pour les freins avant.', true)
    returning id`).split('\n')[0];

  await loginAs(page, 'reception@rts.local');
  await goTo(page, null, 'Mails reçus');
  await expect(page).toHaveURL(/\/agent-direction\/mails$/);
  await page.getByRole('button', { name: new RegExp(`^Paul Garnier ${id}`) }).click();
  await expect(page.getByText('pouvez-vous chiffrer les freins avant de mon porteur')).toBeVisible();

  await page.getByRole('button', { name: `Marquer traité : ${subject}` }).click();
  await expect(page.getByText('Mail rangé dans « Traités »')).toBeVisible();
  await expect
    .poll(() =>
      sql(`select p.email from public.inbox_emails m join public.profiles p on p.id = m.handled_by
           where m.id = '${mailId}'`),
    )
    .toBe('reception@rts.local');
});
