import { expect, test, type Page } from '@playwright/test';

// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';
const REPLY_ID = '00000000-e2e0-0000-0000-0000000000d1';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();
}

/**
 * Mail reçu sur comptoir@ avec sa réponse préparée (table écrite par « mail-inbox ») ; point du
 * jour déjà écouté, voix muette ; l'envoi par « mail-send » est simulé (aucun e-mail réel).
 */
async function simulate(page: Page) {
  const sends: Record<string, unknown>[] = [];
  await page.addInitScript(() => {
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    localStorage.setItem('rts-point-du-jour-ecoute', JSON.stringify({ day, at: now.toISOString() }));
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: { speak: () => undefined, cancel: () => undefined, getVoices: () => [] },
    });
  });
  await page.route('**/functions/v1/agent', (route) =>
    route.fulfill({
      json: {
        briefing: {
          day: '2026-10-09',
          text: 'Un client demande un devis au comptoir.',
          phrases: [{ etiquette: 'Mails', texte: 'Un client demande un devis au comptoir.', urgent: false }],
          tools: ['mails'],
          updated_at: new Date().toISOString(),
        },
      },
    }),
  );
  await page.route('**/rest/v1/inbox_emails?*', (route) => {
    if (route.request().method() === 'HEAD') {
      return route.fulfill({
        status: 200,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-expose-headers': 'content-range',
          'content-range': '*/1',
        },
      });
    }
    return route.fulfill({
      json: [
        {
          id: REPLY_ID,
          mailbox: 'comptoir@rapidtruckservice.fr',
          from_name: 'Lucie Martin',
          from_address: 'lucie.martin@exemple.fr',
          subject: 'Prix filtre à gasoil',
          received_at: new Date().toISOString(),
          category: 'devis',
          urgency: 'normale',
          summary: 'Lucie Martin demande le prix d’un filtre à gasoil.',
          reply_status: sends.length ? 'sent' : 'ready',
          reply_request: 'Elle veut le prix d’un filtre à gasoil pour son Master.',
          reply_subject: 'Re: Prix filtre à gasoil',
          reply_body: 'Bonjour Madame Martin,\nLe filtre est à 38 € HT.\nCordialement,\nRAPID TRUCK SERVICE',
          reply_basis: 'Catalogue des pièces',
          reply_sent_at: sends.length ? new Date().toISOString() : null,
          handled_at: sends.length ? new Date().toISOString() : null,
          clients: null,
        },
      ],
    });
  });
  await page.route('**/functions/v1/mail-send', async (route) => {
    sends.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ json: { id: 'envoi-e2e' } });
  });
  return sends;
}

test('mail reçu sur comptoir@ : la réponse part de comptoir@, dans le fil du mail', async ({ page }) => {
  const sends = await simulate(page);
  await loginAs(page, 'direction@rts.local');
  await page.goto('/agent-direction');

  await page.getByRole('button', { name: 'Relire la réponse à Lucie Martin' }).click();
  const mail = page.getByRole('article', { name: 'Mail de Lucie Martin' });
  await expect(mail.getByText(/sur comptoir@/)).toBeVisible();
  await expect(mail.getByText('Je l’envoie à lucie.martin@exemple.fr depuis comptoir@ ?')).toBeVisible();

  await mail.getByRole('button', { name: 'Envoyer' }).click();
  await expect.poll(() => sends.length, { timeout: 10_000 }).toBe(1);
  // La boîte d'envoi est choisie par mail-send d'après le mail reçu
  expect(sends[0]).toMatchObject({ to: 'lucie.martin@exemple.fr', inbox_email_id: REPLY_ID });
});
