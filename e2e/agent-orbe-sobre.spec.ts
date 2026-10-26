import { expect, test, type Locator, type Page } from '@playwright/test';

// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';
const ANSWER = 'Trois OR sont terminés aujourd’hui.';
const CONVERSATION = 'c0000000-e2e0-0000-0000-0000000000b1';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();
}

/** Voix du navigateur simulée : chaque lecture dure 3 s ; point du jour déjà écouté aujourd'hui. */
async function slowSpeech(page: Page) {
  await page.addInitScript(() => {
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    localStorage.setItem('rts-point-du-jour-ecoute', JSON.stringify({ day, at: now.toISOString() }));
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speak: (utterance: SpeechSynthesisUtterance) => {
          window.setTimeout(() => {
            utterance.onend?.(new Event('end') as SpeechSynthesisEvent);
          }, 3000);
        },
        cancel: () => undefined,
        getVoices: () => [],
      },
    });
  });
}

/** Agent simulé : la réponse arrive après 1,5 s. */
async function slowAgent(page: Page) {
  let asked = false;
  await page.route('**/functions/v1/agent', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.briefing) {
      await route.fulfill({ status: 503, json: { error: 'Assistant pas encore configuré' } });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
    asked = true;
    await route.fulfill({ json: { conversation_id: CONVERSATION, turn_id: 't1', answer: ANSWER } });
  });
  await page.route('**/rest/v1/agent_turns?*', (route) =>
    route.fulfill({
      json: asked
        ? [
            {
              id: 't1',
              conversation_id: CONVERSATION,
              question: 'Combien d’OR terminés ?',
              answer: ANSWER,
              spoken: false,
              tools: ['atelier_aujourdhui'],
              created_at: new Date().toISOString(),
            },
          ]
        : [],
    }),
  );
}

const animation = (locator: Locator) => locator.evaluate((node) => getComputedStyle(node).animationName);

test('orbe sobre : rond calme au repos, arc pendant la recherche, ondes pendant la lecture', async ({
  page,
}) => {
  await slowSpeech(page);
  await slowAgent(page);
  await loginAs(page, 'direction@rts.local');
  await page.goto('/agent-direction');
  await page.getByRole('button', { name: 'Nouvelle conversation' }).click();

  const orb = page.getByRole('img', { name: 'Assistant prêt' });
  await expect(orb).toBeVisible();
  await expect(orb.locator('canvas')).toHaveCount(0);
  expect(await animation(orb.locator('.orb-wave').first())).toBe('none');

  await page.getByRole('button', { name: 'Écrire la question' }).click();
  const question = page.getByRole('textbox', { name: 'Question à l’agent' });
  await question.fill('Combien d’OR terminés ?');
  await question.press('Enter');

  // Recherche : l'arc tourne, pas d'ondes
  const thinking = page.getByRole('img', { name: 'Assistant en train de chercher' });
  await expect(thinking).toBeVisible();
  expect(await animation(thinking.locator('.orb-arc'))).toBe('orb-spin');
  expect(await animation(thinking.locator('.orb-wave').first())).toBe('none');

  // Lecture de la réponse : ondes et rond qui respire
  const speaking = page.getByRole('img', { name: 'Assistant en train de répondre' });
  await expect(speaking).toBeVisible();
  await expect(page.getByText(ANSWER)).toBeVisible();
  expect(await animation(speaking.locator('.orb-wave').first())).toBe('orb-wave');
  expect(await animation(speaking.locator('.orb-core'))).toBe('orb-breathe');
  await expect(page.getByRole('img', { name: 'Assistant prêt' })).toBeVisible({ timeout: 10_000 });
});
