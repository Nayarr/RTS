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

test('réponse lue à voix haute : montants, numéros, dates et plaques écrits pour l’oreille', async ({
  page,
}) => {
  // Voix du navigateur simulée : le texte lu est gardé pour le test
  await page.addInitScript(() => {
    const spoken: string[] = [];
    Object.defineProperty(window, '__spoken', { value: spoken });
    class FakeUtterance {
      text: string;
      lang = '';
      rate = 1;
      voice: unknown = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: FakeUtterance });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speak: (utterance: FakeUtterance) => {
          spoken.push(utterance.text);
          setTimeout(() => utterance.onend?.(), 10);
        },
        cancel: () => undefined,
        getVoices: () => [{ name: 'Denise', lang: 'fr-FR', localService: false }],
      },
    });
  });

  const conversation = crypto.randomUUID();
  const answer = 'La facture F11887 de GH-512-RT reste due : 1 250,00 € TTC, échue le 18/10/2026.';
  sql(
    `insert into public.agent_conversations (id, profile_id, title) values
       ('${conversation}', (select id from public.profiles where email = 'direction@rts.local'), 'Facture');
     insert into public.agent_turns (conversation_id, profile_id, question, answer) values
       ('${conversation}', (select id from public.profiles where email = 'direction@rts.local'),
        'Qu’est-ce qui reste dû ?', '${answer}')`,
  );
  await page.route('**/functions/v1/agent', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.briefing) return route.fulfill({ status: 503, json: { error: 'Point du jour indisponible' } });
    await route.fulfill({ json: { conversation_id: conversation, turn_id: null, answer } });
  });

  await loginAs(page, 'direction@rts.local');
  await page.goto('/agent-direction');
  await page.getByRole('button', { name: 'Écrire la question' }).click();
  await page.getByLabel('Question à l’agent').fill('Qu’est-ce qui reste dû ?');
  await page.getByRole('button', { name: 'Envoyer la question' }).click();
  await expect(page.getByText(answer)).toBeVisible();
  await page.getByRole('button', { name: 'Réécouter' }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken.at(-1)))
    .toBe('La facture 11887 de G H, 512, R T reste due : 1 250 euros T T C, échue le 18 octobre 2026.');
});
