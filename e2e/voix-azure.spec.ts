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

/** Lecteur audio et voix du navigateur simulés : ce qui est joué est gardé pour le test. */
async function fakeAudio(page: Page) {
  await page.addInitScript(() => {
    const log = { audio: [] as string[], browser: [] as string[] };
    Object.defineProperty(window, '__voice', { value: log });
    class FakeAudio {
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public src: string) {}
      play() {
        log.audio.push(this.src);
        setTimeout(() => this.onended?.(), 10);
        return Promise.resolve();
      }
      pause() {}
    }
    Object.defineProperty(window, 'Audio', { configurable: true, value: FakeAudio });
    class FakeUtterance {
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public text: string) {}
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: FakeUtterance });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speak: (utterance: FakeUtterance) => {
          log.browser.push(utterance.text);
          setTimeout(() => utterance.onend?.(), 10);
        },
        cancel: () => undefined,
        getVoices: () => [{ name: 'Denise', lang: 'fr-FR', localService: false }],
      },
    });
  });
}

const voiceLog = (page: Page) =>
  page.evaluate(() => (window as unknown as { __voice: { audio: string[]; browser: string[] } }).__voice);

/** Réglages vus par l'appli : voix Azure choisie (sans toucher aux réglages de la base). */
async function azureChosen(page: Page) {
  await page.route('**/rest/v1/app_settings?*', async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as Record<string, unknown> | Record<string, unknown>[];
    const patch = (row: Record<string, unknown>) => ({ ...row, tts_provider: 'azure', agent_enabled: true });
    await route.fulfill({ response, json: Array.isArray(body) ? body.map(patch) : patch(body) });
  });
}

/** Réponse de l'agent, lue tout de suite (lecture des réponses activée par défaut). */
async function askAndListen(page: Page, answer: string) {
  const conversation = crypto.randomUUID();
  sql(
    `insert into public.agent_conversations (id, profile_id, title) values
       ('${conversation}', (select id from public.profiles where email = 'direction@rts.local'), 'Voix');
     insert into public.agent_turns (conversation_id, profile_id, question, answer) values
       ('${conversation}', (select id from public.profiles where email = 'direction@rts.local'), 'Reste dû ?', '${answer}')`,
  );
  await page.route('**/functions/v1/agent', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.briefing) return route.fulfill({ status: 503, json: { error: 'Point du jour indisponible' } });
    await route.fulfill({ json: { conversation_id: conversation, turn_id: null, answer } });
  });
  await loginAs(page, 'direction@rts.local');
  // Voix réglée connue avant la question (sinon la réponse part avec la voix du navigateur)
  const settings = page.waitForResponse((response) => response.url().includes('/rest/v1/app_settings'));
  await page.goto('/agent-direction');
  await settings;
  await page.getByRole('button', { name: 'Écrire la question' }).click();
  await page.getByLabel('Question à l’agent').fill('Reste dû ?');
  await page.getByRole('button', { name: 'Envoyer la question' }).click();
  await expect(page.getByText(answer)).toBeVisible();
}

test('voix Azure : le texte écrit pour l’oreille est lu par Azure', async ({ page }) => {
  await fakeAudio(page);
  await azureChosen(page);
  const asked: unknown[] = [];
  await page.route('**/functions/v1/tts', async (route) => {
    asked.push(route.request().postDataJSON());
    // Réseau réel : le MP3 arrive après l'affichage de la réponse
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/octet-stream', 'access-control-allow-origin': '*' },
      body: Buffer.from('ID3-mp3-de-test'),
    });
  });
  await askAndListen(page, 'La facture F11887 reste due : 320,00 € TTC.');
  await expect.poll(() => asked).toContainEqual({ text: 'La facture 11887 reste due : 320 euros T T C.' });
  await expect.poll(async () => (await voiceLog(page)).audio.length).toBeGreaterThan(0);
  expect((await voiceLog(page)).browser).toEqual([]);
});

test('voix Azure indisponible (plafond du mois) : voix du navigateur', async ({ page }) => {
  await fakeAudio(page);
  await azureChosen(page);
  await page.route('**/functions/v1/tts', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.fulfill({
      status: 429,
      headers: { 'access-control-allow-origin': '*' },
      json: { error: 'Plafond du mois atteint : voix du navigateur jusqu’au mois prochain' },
    });
  });
  await askAndListen(page, 'Deux factures en retard.');
  await expect.poll(async () => (await voiceLog(page)).browser).toContain('Deux factures en retard.');
});

test('Réglages : voix de l’Agent, essai de la voix choisie, compteur du mois', async ({ page }) => {
  await fakeAudio(page);
  const asked: unknown[] = [];
  await page.route('**/functions/v1/tts', async (route) => {
    asked.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/octet-stream', 'access-control-allow-origin': '*' },
      body: Buffer.from('ID3-mp3-de-test'),
    });
  });
  await loginAs(page, 'direction@rts.local');
  await page.goto('/reglages?onglet=atelier');
  const block = page.getByRole('group', { name: 'Voix de l’Agent' });
  await expect(block.getByRole('status')).toContainText(/Ce mois-ci : \d+ sur 480.000 caractères/);
  await block.getByLabel('Voix Azure').selectOption('fr-FR-HenriNeural');
  await block.getByRole('button', { name: 'Écouter un essai' }).click();
  await expect.poll(() => asked).toHaveLength(1);
  expect(asked[0]).toMatchObject({ voice: 'fr-FR-HenriNeural' });
});
