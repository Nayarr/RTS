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

const mail = (id: string, overrides: Record<string, unknown>) => ({
  id,
  mailbox: 'atelier@rapidtruckservice.fr',
  from_name: 'Jean Moreau',
  from_address: 'jean@transports-moreau.fr',
  subject: 'Devis embrayage AB-123-CD',
  body: 'Bonjour,\nPouvez-vous me faire un devis pour l’embrayage ?',
  attachments: [],
  received_at: new Date().toISOString(),
  triage_status: 'done',
  category: 'devis',
  urgency: 'normale',
  summary: 'Transports Moreau demande un devis embrayage pour AB-123-CD.',
  needs_reply: true,
  handled_at: null,
  clients: { name: 'Transports Moreau & Fils' },
  ...overrides,
});

/**
 * Mails simulés : les copies sont écrites par l'Edge Function (webhook Resend), jamais depuis
 * l'appli ; la page lit la liste et marque les mails traités par la fonction de la base.
 */
async function simulateMails(page: Page) {
  const handled: unknown[] = [];
  const mails = [
    mail('00000000-e2e0-0000-0000-0000000000a1', {}),
    mail('00000000-e2e0-0000-0000-0000000000a2', {
      from_name: 'Fontaine Livraisons',
      subject: 'Camion en panne',
      summary: 'Camion immobilisé à Cergy, demande un dépannage aujourd’hui.',
      category: 'rendez_vous',
      urgency: 'urgente',
      clients: null,
    }),
    mail('00000000-e2e0-0000-0000-0000000000a3', {
      from_name: 'PneuPro',
      subject: 'Promo pneus',
      summary: 'Promotion sur les pneus.',
      category: 'publicite',
      urgency: 'faible',
      needs_reply: false,
      clients: null,
    }),
  ];
  await page.route('**/rest/v1/inbox_emails?*', (route) =>
    route.request().method() === 'HEAD'
      ? route.fulfill({
          status: 200,
          // Appli et base sur deux origines : l'en-tête du compte doit être exposé au navigateur
          headers: {
            'access-control-allow-origin': '*',
            'access-control-expose-headers': 'content-range',
            'content-range': '*/2',
          },
        })
      : route.fulfill({ json: mails }),
  );
  await page.route('**/rest/v1/rpc/set_inbox_emails_handled', async (route) => {
    handled.push(route.request().postDataJSON());
    await route.fulfill({ json: 1 });
  });
  return handled;
}

test('mails reçus : comptés dans l’Agent Direction, triés, lus puis marqués traités', async ({ page }) => {
  const handled = await simulateMails(page);
  await loginAs(page, 'direction@rts.local');
  await page.goto('/agent-direction');

  // Bouton de l'agent (le menu a aussi son lien « Mails reçus »)
  const link = page.getByRole('link', { name: /^Mails reçus .*à traiter/ });
  await expect(link.getByLabel('2 à traiter')).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/agent-direction\/mails$/);

  const rows = page.getByRole('list', { name: 'Mails' }).getByRole('listitem');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('Camion immobilisé à Cergy');
  await expect(rows.nth(1)).toContainText('client : Transports Moreau & Fils');
  await expect(rows.nth(1)).toContainText('Réponse attendue');

  await page.getByRole('button', { name: /^Jean Moreau/ }).click();
  await expect(page.getByText(/Pouvez-vous me faire un devis pour l’embrayage/)).toBeVisible();

  await page.getByRole('button', { name: 'Marquer traité : Devis embrayage AB-123-CD' }).click();
  await expect(page.getByText('Mail rangé dans « Traités »')).toBeVisible();
  expect(handled).toEqual([{ p_ids: ['00000000-e2e0-0000-0000-0000000000a1'], p_handled: true }]);

  await page.getByRole('button', { name: /^Publicité et indésirables/ }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Promo pneus');
});

test('mails reçus : ouverts à la réception, pas au technicien', async ({ page }) => {
  await simulateMails(page);
  await loginAs(page, 'reception@rts.local');
  await page.goto('/agent-direction/mails');
  await expect(page.getByRole('heading', { name: 'Mails reçus' })).toBeVisible();
  await page.getByRole('button', { name: 'Se déconnecter' }).first().click();
  await loginAs(page, 'alice@rts.local');
  await page.goto('/agent-direction/mails');
  await expect(page.getByRole('heading', { name: 'Mails reçus' })).toBeHidden();
});
