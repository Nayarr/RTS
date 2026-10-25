import { expect, test, type Page } from '@playwright/test';

// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();
}

/** Lecteur audio simulé : rien n'est joué pendant le test. */
async function fakeAudio(page: Page) {
  await page.addInitScript(() => {
    class FakeAudio {
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public src: string) {}
      play() {
        setTimeout(() => this.onended?.(), 10);
        return Promise.resolve();
      }
      pause() {}
    }
    Object.defineProperty(window, 'Audio', { configurable: true, value: FakeAudio });
  });
}

test('Réglages : Ximena, voix par défaut, essai envoyé avec sa voix', async ({ page }) => {
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
  const voice = block.getByLabel('Voix Azure');
  await expect(voice).toHaveValue('es-ES-XimenaMultilingualNeural');
  await expect(voice.locator('option:checked')).toHaveText('Ximena (femme, multilingue)');
  await block.getByRole('button', { name: 'Écouter un essai' }).click();
  await expect.poll(() => asked).toHaveLength(1);
  expect(asked[0]).toMatchObject({ voice: 'es-ES-XimenaMultilingualNeural' });
});
