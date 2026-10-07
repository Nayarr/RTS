import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';

const env = loadEnv('production', process.cwd(), 'VITE_');
// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();
}

async function setMemo(memo: string) {
  const api = createClient<Database>(env.VITE_SUPABASE_URL ?? '', env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '', {
    auth: { persistSession: false },
  });
  await api.auth.signInWithPassword({ email: 'direction@rts.local', password: PASSWORD });
  const { error } = await api.from('app_settings').update({ agent_memo: memo }).eq('id', true);
  if (error) throw error;
}

test('direction : mémo pour l’Agent Direction enregistré dans les réglages', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Réglage global : une seule fois');
  await setMemo('');
  try {
    await loginAs(page, 'direction@rts.local');
    await page.goto('/reglages?onglet=atelier');
    const memo = page.getByRole('textbox', { name: 'Mémo pour l’Agent Direction' });
    await expect(memo).toHaveValue('');
    await memo.fill('Karim est chef d’atelier.\nQuand je dis « Martin », c’est BTP Martin Location.');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Réglages de l’atelier enregistrés')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Mémo pour l’Agent Direction' })).toHaveValue(
      'Karim est chef d’atelier.\nQuand je dis « Martin », c’est BTP Martin Location.',
    );
  } finally {
    await setMemo('');
  }
});

test('question dictée : les autres versions entendues partent avec la question', async ({ page }) => {
  // Dictée simulée : le navigateur hésite entre trois versions de la même phrase
  await page.addInitScript(() => {
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
          const heard = [
            'montre-moi les horaires qui sont signés',
            'montre-moi les OR qui sont assignés',
            'montre-moi les horaires qui sont assignés',
          ].slice(0, this.maxAlternatives);
          this.onresult?.({
            resultIndex: 0,
            results: [
              Object.assign(
                heard.map((transcript) => ({ transcript })),
                { isFinal: true },
              ),
            ],
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
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: { speak: () => undefined, cancel: () => undefined, getVoices: () => [] },
    });
  });
  const requests: Record<string, unknown>[] = [];
  await page.route('**/functions/v1/agent', async (route) => {
    requests.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ status: 503, json: { error: 'Assistant pas encore configuré' } });
  });

  await loginAs(page, 'direction@rts.local');
  await page.goto('/agent-direction');
  await page.getByRole('button', { name: 'Poser la question à la voix' }).click();
  await expect(page.getByRole('alert')).toContainText('Assistant pas encore configuré');
  expect(requests).toEqual([
    {
      question: 'Montre-moi les horaires qui sont signés',
      spoken: true,
      alternatives: ['Montre-moi les OR qui sont assignés', 'Montre-moi les horaires qui sont assignés'],
    },
  ]);
});
