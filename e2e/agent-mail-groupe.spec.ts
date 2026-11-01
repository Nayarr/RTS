import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { sql } from './support/db';

// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';
const DIRECTION = `(select id from public.profiles where email = 'direction@rts.local')`;

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();
}

const suffix = (testInfo: TestInfo) =>
  `${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-7)}`;

test('agent : mail groupé aux clients relu, un destinataire retiré, envoyé en une fois', async ({
  page,
}, testInfo) => {
  const id = suffix(testInfo);
  const conversation = crypto.randomUUID();
  const mailing = crypto.randomUUID();
  const [martin, leroy] = [crypto.randomUUID(), crypto.randomUUID()];
  const answer = 'Le mail sur la machine de parallélisme est prêt pour 2 clients.';
  // Ce que l'agent note quand on lui demande d'écrire à tous les clients
  const payload = {
    subject: 'Machine de parallélisme à vendre',
    text: 'Bonjour {client},\nNous vendons notre machine de parallélisme.\nL’équipe de RAPID TRUCK SERVICE',
    category: 'workshop',
    recipients: [
      { client_id: martin, name: `Transports Martin ${id}`, to: `compta.${id.toLowerCase()}@martin.fr` },
      { client_id: leroy, name: `Frigo Leroy ${id}`, to: `atelier.${id.toLowerCase()}@leroy.fr` },
    ],
    without_email: 1,
  };
  sql(
    `insert into public.agent_conversations (id, profile_id, title) values
       ('${conversation}', ${DIRECTION}, 'Machine de parallélisme');
     insert into public.agent_turns (conversation_id, profile_id, question, answer) values
       ('${conversation}', ${DIRECTION}, 'Envoie à tous mes clients qu''on vend la machine de parallélisme',
        '${answer}');
     insert into public.agent_actions (id, profile_id, conversation_id, kind, payload, summary) values
       ('${mailing}', ${DIRECTION}, '${conversation}', 'send_mailing',
        '${JSON.stringify(payload).replaceAll("'", "''")}',
        'Mail groupé à 2 clients : « Machine de parallélisme à vendre »');`,
  );
  await page.route('**/functions/v1/agent', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.briefing) return route.fulfill({ status: 503, json: { error: 'Point du jour indisponible' } });
    await route.fulfill({ json: { conversation_id: conversation, turn_id: null, answer, actions: [] } });
  });
  const sent: unknown[] = [];
  await page.route('**/functions/v1/mail-send', async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill({ json: { sent: 1 } });
  });

  await loginAs(page, 'direction@rts.local');
  await page.goto('/agent-direction');
  await page.getByRole('button', { name: 'Écrire la question' }).click();
  await page
    .getByLabel('Question à l’agent')
    .fill('Envoie à tous mes clients qu’on vend la machine de parallélisme');
  await page.getByRole('button', { name: 'Envoyer la question' }).click();

  const card = page.getByRole('region', { name: 'Mail groupé' });
  await expect(card).toContainText('Mail groupé à 2 clients');
  await expect(card.getByLabel('Objet')).toHaveValue('Machine de parallélisme à vendre');
  await card.getByText(/Destinataires : 2 sur 2/).click();
  await expect(card).toContainText('1 sans e-mail, écarté');
  await card.getByRole('checkbox', { name: new RegExp(`Frigo Leroy ${id}`) }).uncheck();
  await card.getByRole('button', { name: 'Envoyer à 1 client' }).click();
  await expect(card).toContainText(/Envoi dans \d s/);
  await expect.poll(() => sent.length, { timeout: 10_000 }).toBe(1);
  expect(sent[0]).toEqual({ agent_action_id: mailing, idempotency_key: mailing });
  // Destinataire retiré avant l'envoi, résumé à jour
  expect(
    sql(
      `select jsonb_array_length(payload -> 'recipients') from public.agent_actions where id = '${mailing}'`,
    ),
  ).toBe('1');
  expect(sql(`select summary from public.agent_actions where id = '${mailing}'`)).toBe(
    'Mail groupé à 1 client : « Machine de parallélisme à vendre »',
  );
});
