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

test('agent : liste des contrôles en tableau, un mail par client relu un par un, échéance validée', async ({
  page,
}, testInfo) => {
  test.slow();
  const id = suffix(testInfo);
  const plate = `AO${id}`;
  const conversation = crypto.randomUUID();
  const [first, second, deadline] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  const vehicle = sql(
    `insert into public.vehicles (plate, vehicle_type) values ('${plate}', 'pl') returning id`,
  ).split('\n')[0];
  const table = {
    titre: 'Contrôles techniques d’ici fin novembre',
    colonnes: ['Plaque', 'Client', 'Échéance'],
    lignes: [
      [plate, `Transports Martin ${id}`, '12/11/2026'],
      ['EF-456-GH', `Frigo Leroy ${id}`, '28/11/2026'],
    ],
  };
  // Ce que l'agent note quand il répond : la liste en tableau, deux mails et une échéance
  const mail = (action: string, client: string, secondsAgo: number) =>
    `('${action}', ${DIRECTION}, '${conversation}', 'send_mail',
      '{"to": "contact.${client.toLowerCase()}.${id.toLowerCase()}@exemple.fr", "client_name": "${client} ${id}",
        "subject": "Contrôle technique à prévoir", "text": "Bonjour,\\nLe contrôle technique de votre véhicule approche.",
        "category": "workshop", "invoice_ids": []}',
      'Mail à ${client} ${id} : « Contrôle technique à prévoir »', now() - interval '${secondsAgo} seconds')`;
  sql(
    `insert into public.agent_conversations (id, profile_id, title) values
       ('${conversation}', ${DIRECTION}, 'Contrôles techniques');
     insert into public.agent_turns (conversation_id, profile_id, question, answer, tables) values
       ('${conversation}', ${DIRECTION}, 'Contrôles techniques à venir',
        'Deux véhicules passent le contrôle technique d''ici fin novembre : les mails sont prêts.',
        '${JSON.stringify([table]).replaceAll("'", "''")}');
     insert into public.agent_actions (id, profile_id, conversation_id, kind, payload, summary, created_at) values
       ${mail(first, 'Martin', 2)}, ${mail(second, 'Leroy', 1)},
       ('${deadline}', ${DIRECTION}, '${conversation}', 'vehicle_deadline',
        '{"vehicle_id": "${vehicle}", "field": "ct_due_date", "date": "2027-01-15"}',
        'Contrôle technique de ${plate} : le vendredi 15 janvier', now());`,
  );
  await page.route('**/functions/v1/agent', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.briefing) return route.fulfill({ status: 503, json: { error: 'Point du jour indisponible' } });
    await route.fulfill({
      json: {
        conversation_id: conversation,
        turn_id: null,
        answer: 'Deux véhicules passent le contrôle technique d’ici fin novembre : les mails sont prêts.',
        actions: [],
        tables: [table],
      },
    });
  });
  const sent: unknown[] = [];
  await page.route('**/functions/v1/mail-send', async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill({ json: { id: 'resend-1' } });
  });

  await loginAs(page, 'direction@rts.local');
  await page.goto('/agent-direction');
  await page.getByRole('button', { name: 'Écrire la question' }).click();
  await page.getByLabel('Question à l’agent').fill('Contrôles techniques à venir');
  await page.getByRole('button', { name: 'Envoyer la question' }).click();

  // Tableau : lu, téléchargé en CSV
  const list = page.getByRole('region', { name: table.titre });
  await expect(list.getByRole('cell', { name: `Frigo Leroy ${id}` })).toBeVisible();
  const download = page.waitForEvent('download');
  await list.getByRole('button', { name: 'CSV' }).click();
  expect((await download).suggestedFilename()).toBe('controles-techniques-d-ici-fin-novembre.csv');

  // Échéance : préparée, faite après « Valider »
  const prepared = page.getByRole('list', { name: 'Actions préparées' }).getByRole('listitem');
  await expect(prepared).toContainText(`Contrôle technique de ${plate}`);
  await prepared.getByRole('button', { name: 'Valider' }).click();
  await expect
    .poll(() => sql(`select ct_due_date from public.vehicles where id = '${vehicle}'`), { timeout: 15_000 })
    .toBe('2027-01-15');

  // Mails : un par un, le second écarté, le premier modifié puis envoyé
  const mails = page.getByRole('region', { name: 'Mails préparés' });
  await expect(mails).toContainText(`Mail 1 sur 2 · Martin ${id}`);
  await mails.getByRole('button', { name: 'Mail suivant' }).click();
  await expect(mails).toContainText(`Mail 2 sur 2 · Leroy ${id}`);
  await mails.getByRole('button', { name: 'Ne pas envoyer' }).click();
  await expect(mails).toContainText(`Mail préparé · Martin ${id}`);
  await mails.getByLabel('Objet').fill('Votre contrôle technique de novembre');
  await mails.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await expect(mails).toContainText(/Envoi dans \d s/);
  await expect.poll(() => sent.length, { timeout: 10_000 }).toBe(1);
  expect(sent[0]).toEqual({ agent_action_id: first, idempotency_key: first });
  expect(sql(`select payload ->> 'subject' from public.agent_actions where id = '${first}'`)).toBe(
    'Votre contrôle technique de novembre',
  );
  expect(sql(`select status from public.agent_actions where id = '${second}'`)).toBe('cancelled');
});
