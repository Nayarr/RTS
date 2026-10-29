import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { sql } from './support/db';

// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';
const RECEPTION = `(select id from public.profiles where email = 'reception@rts.local')`;

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();
}

const suffix = (testInfo: TestInfo) =>
  `${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-7)}`;

test('réception : Agent Direction en lecture seule, mails relus un par un puis envoyés', async ({
  page,
}, testInfo) => {
  test.slow();
  const id = suffix(testInfo);
  const conversation = crypto.randomUUID();
  const [first, second] = [crypto.randomUUID(), crypto.randomUUID()];
  // Ce que l'agent note quand il répond à la réception : deux mails, rien d'autre
  const mail = (action: string, client: string, secondsAgo: number) =>
    `('${action}', ${RECEPTION}, '${conversation}', 'send_mail',
      '{"to": "contact.${client.toLowerCase()}.${id.toLowerCase()}@exemple.fr", "client_name": "${client} ${id}",
        "subject": "Contrôle technique à prévoir", "text": "Bonjour,\\nLe contrôle technique de votre véhicule approche.",
        "category": "workshop", "invoice_ids": []}',
      'Mail à ${client} ${id} : « Contrôle technique à prévoir »', now() - interval '${secondsAgo} seconds')`;
  sql(
    `insert into public.agent_conversations (id, profile_id, title) values
       ('${conversation}', ${RECEPTION}, 'Contrôles techniques');
     insert into public.agent_turns (conversation_id, profile_id, question, answer) values
       ('${conversation}', ${RECEPTION}, 'Écris aux clients dont le contrôle technique approche',
        'Deux clients ont un contrôle technique d''ici fin novembre : les mails sont prêts.');
     insert into public.agent_actions (id, profile_id, conversation_id, kind, payload, summary, created_at) values
       ${mail(first, 'Martin', 2)}, ${mail(second, 'Leroy', 1)};`,
  );
  await page.route('**/functions/v1/agent', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.briefing) return route.fulfill({ status: 503, json: { error: 'Point du jour indisponible' } });
    await route.fulfill({
      json: {
        conversation_id: conversation,
        turn_id: null,
        answer: 'Deux clients ont un contrôle technique d’ici fin novembre : les mails sont prêts.',
        actions: [],
        tables: [],
      },
    });
  });
  const sent: unknown[] = [];
  await page.route('**/functions/v1/mail-send', async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill({ json: { id: 'resend-1' } });
  });

  await loginAs(page, 'reception@rts.local');
  // L'agent, sans les questions sur le chiffre d'affaires
  await page.goto('/agent-direction');
  await expect(page.getByRole('heading', { name: 'Agent Direction' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Combien on a facturé ce mois-ci ?' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Écrire la question' }).click();
  await page.getByLabel('Question à l’agent').fill('Écris aux clients dont le contrôle technique approche');
  await page.getByRole('button', { name: 'Envoyer la question' }).click();

  // Mails seulement : aucune autre action à valider
  const mails = page.getByRole('region', { name: 'Mails préparés' });
  await expect(mails).toContainText(`Mail 1 sur 2 · Martin ${id}`);
  await expect(page.getByRole('list', { name: 'Actions préparées' })).toHaveCount(0);
  await mails.getByRole('button', { name: 'Mail suivant' }).click();
  await mails.getByRole('button', { name: 'Ne pas envoyer' }).click();
  await expect(mails).toContainText(`Mail préparé · Martin ${id}`);
  await mails.getByLabel('Objet').fill('Votre contrôle technique de novembre');
  await mails.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await expect.poll(() => sent.length, { timeout: 10_000 }).toBe(1);
  expect(sent[0]).toEqual({ agent_action_id: first, idempotency_key: first });
  expect(sql(`select payload ->> 'subject' from public.agent_actions where id = '${first}'`)).toBe(
    'Votre contrôle technique de novembre',
  );
  expect(sql(`select status from public.agent_actions where id = '${second}'`)).toBe('cancelled');
});
