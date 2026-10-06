import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';

const env = loadEnv('production', process.cwd(), 'VITE_');
// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';
const ANSWER = 'Ce mois-ci, 12 450 euros hors taxes sur 18 factures.';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();
}

async function setAgentEnabled(enabled: boolean) {
  const api = createClient<Database>(env.VITE_SUPABASE_URL ?? '', env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '', {
    auth: { persistSession: false },
  });
  await api.auth.signInWithPassword({ email: 'direction@rts.local', password: PASSWORD });
  const { error } = await api.from('app_settings').update({ agent_enabled: enabled }).eq('id', true);
  if (error) throw error;
}

/** Voix du navigateur simulée : le texte lu est gardé dans window.__spoken. */
async function fakeSpeech(page: Page) {
  await page.addInitScript(() => {
    const spoken: string[] = [];
    Object.assign(window, { __spoken: spoken });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speak: (utterance: SpeechSynthesisUtterance) => {
          spoken.push(utterance.text);
          utterance.onend?.(new Event('end') as SpeechSynthesisEvent);
        },
        cancel: () => undefined,
        getVoices: () => [],
      },
    });
  });
}

/** Dictée simulée : le micro « entend » la phrase donnée. */
async function fakeDictation(page: Page, phrase: string) {
  await page.addInitScript((heard) => {
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
    // Chromium a aussi sa propre reconnaissance, sans préfixe : les deux sont remplacées
    for (const name of ['SpeechRecognition', 'webkitSpeechRecognition']) {
      Object.defineProperty(window, name, { configurable: true, writable: true, value: FakeRecognition });
    }
  }, phrase);
}

/**
 * Assistant simulé (la clé de l'API n'existe pas en test) : la fonction répond, puis la page relit
 * la conversation et sa question dans la base, simulées elles aussi.
 */
async function simulateAgent(page: Page) {
  const requests: Record<string, unknown>[] = [];
  await page.route('**/functions/v1/agent', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    requests.push(body);
    await route.fulfill({
      json: { conversation_id: 'c0000000-e2e0-0000-0000-000000000001', turn_id: 't1', answer: ANSWER },
    });
  });
  await page.route('**/rest/v1/agent_conversations?*', (route) =>
    route.fulfill({
      json: requests.length
        ? [
            {
              id: 'c0000000-e2e0-0000-0000-000000000001',
              title: String(requests[0]?.question),
              updated_at: new Date().toISOString(),
            },
          ]
        : [],
    }),
  );
  await page.route('**/rest/v1/agent_turns?*', (route) =>
    route.fulfill({
      json: requests.map((request, index) => ({
        id: `t${index + 1}`,
        conversation_id: 'c0000000-e2e0-0000-0000-000000000001',
        question: request.question,
        answer: ANSWER,
        spoken: request.spoken,
        tools: ['chiffres_du_mois', 'factures_impayees'],
        created_at: new Date().toISOString(),
      })),
    }),
  );
  return requests;
}

test('direction : Agent Direction activé dans les réglages', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Réglage global : une seule fois');
  await setAgentEnabled(false);
  try {
    await loginAs(page, 'direction@rts.local');
    await page.goto('/reglages?onglet=atelier');
    const toggle = page.getByRole('switch', { name: 'Agent Direction' });
    await expect(toggle).not.toBeChecked();
    await toggle.click();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Réglages de l’atelier enregistrés')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('switch', { name: 'Agent Direction' })).toBeChecked();
  } finally {
    await setAgentEnabled(false);
  }
});

test('onglet du menu, question proposée : réponse affichée avec ses sources et lue à voix haute', async ({
  page,
}, testInfo) => {
  await fakeSpeech(page);
  const requests = await simulateAgent(page);
  await loginAs(page, 'direction@rts.local');
  if (testInfo.project.name.includes('mobile')) await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('link', { name: /Agent Direction/ }).click();
  await expect(page).toHaveURL(/\/agent-direction$/);

  await expect(page.getByText('que veux-tu savoir ?')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Assistant prêt' })).toBeVisible();
  await page.getByRole('button', { name: 'Combien on a facturé ce mois-ci ?' }).click();

  await expect(page.getByText(ANSWER)).toBeVisible();
  await expect(page.getByText('Sources : chiffres du mois, factures impayées')).toBeVisible();
  expect(requests).toEqual([{ question: 'Combien on a facturé ce mois-ci ?', spoken: false }]);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken))
    .toEqual([ANSWER]);

  await page.getByRole('button', { name: 'Historique', exact: true }).click();
  await expect(
    page
      .getByRole('complementary', { name: 'Conversations' })
      .getByRole('button', { name: /^Combien on a facturé/ }),
  ).toHaveAttribute('aria-current', 'true');
});

test('question à la voix : orbe à l’écoute, question envoyée comme posée à la voix', async ({ page }) => {
  await fakeSpeech(page);
  await fakeDictation(page, 'qui nous doit de l’argent ?');
  const requests = await simulateAgent(page);
  await loginAs(page, 'direction@rts.local');
  await page.goto('/agent-direction');

  await page.getByRole('button', { name: 'Poser la question à la voix' }).click();
  await expect(page.getByRole('img', { name: 'Assistant à l’écoute' })).toBeVisible();
  await expect(page.getByText(ANSWER)).toBeVisible();
  expect(requests).toEqual([{ question: 'Qui nous doit de l’argent ?', spoken: true }]);
});

test('agent sans clé configurée : message clair, question gardée pour la renvoyer', async ({ page }) => {
  await loginAs(page, 'direction@rts.local');
  await page.goto('/agent-direction');
  await page.getByRole('button', { name: 'Écrire la question' }).click();
  const question = page.getByRole('textbox', { name: 'Question à l’agent' });
  await question.fill('Combien de rendez-vous demain ?');
  await question.press('Enter');
  await expect(page.getByRole('alert')).toContainText('Assistant pas encore configuré');
  await expect(question).toHaveValue('Combien de rendez-vous demain ?');
});

test('ancienne adresse Pilotage › Assistant : renvoyée vers Agent Direction', async ({ page }) => {
  await loginAs(page, 'direction@rts.local');
  await page.goto('/pilotage/assistant');
  await expect(page).toHaveURL(/\/agent-direction$/);
});

test('réception : pas d’Agent Direction', async ({ page }, testInfo) => {
  await loginAs(page, 'reception@rts.local');
  if (testInfo.project.name.includes('mobile')) await page.getByRole('button', { name: 'Menu' }).click();
  await expect(page.getByRole('link', { name: /Agent Direction/ })).toHaveCount(0);
  await page.goto('/agent-direction');
  await expect(page.getByText('Accès refusé')).toBeVisible();
});
