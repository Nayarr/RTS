import { expect, test, type Page } from '@playwright/test';

// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';
const REPLY_ID = '00000000-e2e0-0000-0000-0000000000b1';
const ANSWER = 'Demain, trois rendez-vous sont prévus.';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();
}

/**
 * Voix simulée : chaque phrase lue est gardée dans window.__spoken et se termine aussitôt.
 * `listened` : point déjà écouté aujourd'hui (il ne repart pas tout seul).
 */
async function fakeVoice(page: Page, { listened, heard }: { listened: boolean; heard?: string }) {
  await page.addInitScript(
    ({ listened, heard }) => {
      const now = new Date();
      const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      if (listened)
        localStorage.setItem('rts-point-du-jour-ecoute', JSON.stringify({ day, at: now.toISOString() }));
      else localStorage.removeItem('rts-point-du-jour-ecoute');
      const spoken: string[] = [];
      Object.assign(window, { __spoken: spoken });
      Object.defineProperty(window, 'speechSynthesis', {
        configurable: true,
        value: {
          speak: (utterance: SpeechSynthesisUtterance) => {
            spoken.push(utterance.text);
            setTimeout(() => {
              utterance.onend?.(new Event('end') as SpeechSynthesisEvent);
            }, 30);
          },
          cancel: () => undefined,
          getVoices: () => [],
        },
      });
      if (!heard) return;
      class FakeRecognition {
        lang = '';
        interimResults = false;
        continuous = false;
        maxAlternatives = 1;
        onresult: ((event: unknown) => void) | null = null;
        onerror: ((event: unknown) => void) | null = null;
        onend: (() => void) | null = null;
        start() {
          setTimeout(() => {
            this.onresult?.({
              resultIndex: 0,
              results: [Object.assign([{ transcript: heard }], { isFinal: true })],
            });
            this.onend?.();
          }, 200);
        }
        stop() {
          this.onend?.();
        }
        abort() {}
      }
      for (const name of ['SpeechRecognition', 'webkitSpeechRecognition']) {
        Object.defineProperty(window, name, { configurable: true, writable: true, value: FakeRecognition });
      }
    },
    { listened, heard },
  );
}

/**
 * Point du jour, réponse préparée et envoi simulés : le point vient de l'Edge Function « agent »,
 * la réponse préparée de la table des mails reçus (écrite par « mail-inbox »), l'envoi part par
 * « mail-send » (aucun e-mail réel).
 */
async function simulate(page: Page) {
  const sends: Record<string, unknown>[] = [];
  const postponed: unknown[] = [];
  let status = 'ready';
  await page.route('**/functions/v1/agent', (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (!body.briefing) {
      return route.fulfill({
        json: { conversation_id: '00000000-e2e0-0000-0000-0000000000c1', turn_id: 't1', answer: ANSWER },
      });
    }
    return route.fulfill({
      json: {
        briefing: {
          day: '2026-10-09',
          text: 'Paul Fontaine signale un porteur en panne.\nSept OR en cours.',
          phrases: [
            { etiquette: 'Urgent', texte: 'Paul Fontaine signale un porteur en panne.', urgent: true },
            { etiquette: 'Atelier', texte: 'Sept OR en cours.', urgent: false },
          ],
          tools: ['mails'],
          updated_at: new Date().toISOString(),
        },
      },
    });
  });
  await page.route('**/rest/v1/agent_turns?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 't1',
          conversation_id: '00000000-e2e0-0000-0000-0000000000c1',
          question: 'Combien de rendez-vous demain ?',
          answer: ANSWER,
          spoken: false,
          tools: ['rendez_vous'],
          created_at: new Date().toISOString(),
        },
      ],
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
          mailbox: 'atelier@rapidtruckservice.fr',
          from_name: 'Paul Fontaine',
          from_address: 'fontaine.livraisons@exemple.fr',
          subject: 'URGENT porteur en panne',
          received_at: new Date().toISOString(),
          category: 'rendez_vous',
          urgency: 'urgente',
          summary: 'Porteur HB-376-CP en panne à Gennevilliers.',
          reply_status: status,
          reply_request: 'Son porteur HB-376-CP ne démarre plus, il veut une intervention aujourd’hui.',
          reply_subject: 'Re: URGENT porteur en panne',
          reply_body:
            'Bonjour Monsieur Fontaine,\nNous vous rappelons dans l’heure.\nCordialement,\nRAPID TRUCK SERVICE',
          reply_basis: 'HB-376-CP : Renault Master',
          reply_sent_at: status === 'sent' ? new Date().toISOString() : null,
          handled_at: status === 'sent' ? new Date().toISOString() : null,
          clients: { name: 'Fontaine Livraisons' },
        },
      ],
    });
  });
  await page.route('**/rest/v1/rpc/postpone_inbox_reply', async (route) => {
    postponed.push(route.request().postDataJSON());
    status = 'postponed';
    await route.fulfill({ json: true });
  });
  await page.route('**/functions/v1/mail-send', async (route) => {
    sends.push(route.request().postDataJSON() as Record<string, unknown>);
    status = 'sent';
    await route.fulfill({ json: { id: 'envoi-e2e' } });
  });
  return { sends, postponed };
}

test('point du jour lu à l’ouverture, réponse dictée, « envoie » à la voix : envoi après 5 secondes', async ({
  page,
}) => {
  await fakeVoice(page, { listened: false, heard: 'oui envoie' });
  const { sends } = await simulate(page);
  await loginAs(page, 'direction@rts.local');
  await page.goto('/agent-direction');

  const mail = page.getByRole('article', { name: 'Mail de Paul Fontaine' });
  await expect(mail).toBeVisible();
  await expect(mail.getByText(/Envoi dans 5 secondes à fontaine\.livraisons@exemple\.fr/)).toBeVisible();
  expect(sends).toEqual([]);
  await expect.poll(() => sends.length, { timeout: 10_000 }).toBe(1);
  expect(sends[0]).toMatchObject({
    category: 'workshop',
    to: 'fontaine.livraisons@exemple.fr',
    subject: 'Re: URGENT porteur en panne',
    inbox_email_id: REPLY_ID,
    idempotency_key: REPLY_ID,
  });
  const spoken = await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);
  expect(spoken.slice(0, 3)).toEqual([
    'Paul Fontaine signale un porteur en panne.',
    'Sept OR en cours.',
    'Mail de Paul Fontaine. Son porteur HB-376-CP ne démarre plus, il veut une intervention aujourd’hui. Voici la réponse préparée.',
  ]);
  expect(spoken.at(-1)).toBe('Je l’envoie à Paul Fontaine ?');

  // Après l'écoute : le point reste consultable, la réponse est notée envoyée
  const point = page.getByRole('region', { name: 'Point du jour' });
  await expect(point.getByRole('button', { name: 'Réécouter' })).toBeVisible();
  await expect(point.getByText(/Envoyée à/)).toBeVisible();
});

test('réponse relue : envoi annulé pendant 5 secondes, puis remise à plus tard', async ({ page }) => {
  await fakeVoice(page, { listened: true });
  const { sends, postponed } = await simulate(page);
  await loginAs(page, 'direction@rts.local');
  await page.goto('/agent-direction');

  await page.getByRole('button', { name: 'Relire la réponse à Paul Fontaine' }).click();
  const mail = page.getByRole('article', { name: 'Mail de Paul Fontaine' });
  await expect(mail.getByText('Ce qu’il demande')).toBeVisible();
  await mail.getByRole('button', { name: 'Envoyer' }).click();
  await mail.getByRole('button', { name: 'Annuler l’envoi' }).click();
  await page.waitForTimeout(6_000);
  expect(sends).toEqual([]);

  await mail.getByRole('button', { name: 'Plus tard' }).click();
  await expect.poll(() => postponed).toEqual([{ p_id: REPLY_ID }]);
  await expect(page.getByText('tu as dit « plus tard »', { exact: false })).toBeVisible();
});

test('bouton « Point du jour » : retour au point depuis une conversation', async ({ page }) => {
  await fakeVoice(page, { listened: true });
  await simulate(page);
  await loginAs(page, 'direction@rts.local');
  await page.goto('/agent-direction');
  const point = page.getByRole('region', { name: 'Point du jour' });
  await expect(point.getByText('Sept OR en cours.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Point du jour' })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Écrire la question' }).click();
  const question = page.getByRole('textbox', { name: 'Question à l’agent' });
  await question.fill('Combien de rendez-vous demain ?');
  await question.press('Enter');
  await expect(page.getByText(ANSWER)).toBeVisible();
  await expect(point).toBeHidden();
  await expect(page.getByRole('button', { name: 'Point du jour' })).toHaveAttribute('aria-pressed', 'false');

  await page.getByRole('button', { name: 'Point du jour' }).click();
  await expect(point.getByText('Sept OR en cours.')).toBeVisible();
});
