import { expect, test, type Page } from '@playwright/test';
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

test('agent : « la pièce de l’OR est arrivée », passée « Reçue » seulement après « Valider »', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Agent Direction au bureau');
  const plate = `PR${String(Date.now()).slice(-7)}`;
  const conversation = crypto.randomUUID();
  const action = crypto.randomUUID();
  const order = sql(
    `with v as (insert into public.vehicles (plate, vehicle_type) values ('${plate}', 'pl') returning id)
     insert into public.repair_orders (vehicle_id, requested_work, status)
     select id, 'Freinage', 'in_progress' from v returning id`,
  ).split('\n')[0];
  // Pièce commandée, ajoutée comme le fait le bureau (droits de la direction)
  const line = sql(
    `select set_config('request.jwt.claims', json_build_object('sub', ${DIRECTION}, 'role', 'authenticated')::text, false);
     insert into public.ro_lines (repair_order_id, kind, position, line_type, description, quantity, order_status)
     values ('${order}', 'planned', 0, 'part', 'Disque de frein avant', 2, 'ordered') returning id`,
  )
    .split('\n')
    .find((row) => /^[0-9a-f-]{36}$/.test(row));
  const number = sql(`select number from public.repair_orders where id = '${order}'`);
  const summary = `Pièce « Disque de frein avant » de l’OR ${number} (${plate}) : passer en « Reçue »`;
  sql(
    `insert into public.agent_conversations (id, profile_id, title) values
       ('${conversation}', ${DIRECTION}, 'Pièce arrivée');
     insert into public.agent_turns (conversation_id, profile_id, question, answer) values
       ('${conversation}', ${DIRECTION}, 'La pièce disque de frein est arrivée',
        'Je passe le disque de frein avant en reçu. Je le fais ?');
     insert into public.agent_actions (id, profile_id, conversation_id, kind, payload, summary) values
       ('${action}', ${DIRECTION}, '${conversation}', 'part_received',
        '{"repair_order_id": "${order}", "line_id": "${line}", "description": "Disque de frein avant"}',
        '${summary.replaceAll("'", "''")}');`,
  );
  await page.route('**/functions/v1/agent', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.briefing) return route.fulfill({ status: 503, json: { error: 'Point du jour indisponible' } });
    await route.fulfill({
      json: {
        conversation_id: conversation,
        turn_id: null,
        answer: `Je passe le disque de frein avant de l’OR ${number} en reçu. Je le fais ?`,
        actions: [],
      },
    });
  });

  await loginAs(page, 'direction@rts.local');
  await page.goto('/agent-direction');
  await page.getByRole('button', { name: 'Écrire la question' }).click();
  await page.getByLabel('Question à l’agent').fill(`La pièce disque de frein de l’OR ${number} est arrivée`);
  await page.getByRole('button', { name: 'Envoyer la question' }).click();

  const prepared = page.getByRole('list', { name: 'Actions préparées' }).getByRole('listitem');
  await expect(prepared).toContainText(summary);
  // Rien n'est changé tant que la direction n'a pas validé
  expect(sql(`select order_status from public.ro_lines where id = '${line}'`)).toBe('ordered');

  await prepared.getByRole('button', { name: 'Valider' }).click();
  await expect
    .poll(() => sql(`select order_status from public.ro_lines where id = '${line}'`), { timeout: 15_000 })
    .toBe('received');
});
