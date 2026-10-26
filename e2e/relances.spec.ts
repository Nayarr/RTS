import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';
import { sql } from './support/db';

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

const suffix = (testInfo: TestInfo) =>
  `${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-7)}`;

/** Facture émise de 324 € TTC pour un nouveau client avec e-mail, échue depuis un mois (API : réception). */
async function createOverdueInvoice(plate: string, clientName: string, email: string) {
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      auth: { persistSession: false },
    },
  );
  await client.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: order, error } = await client.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: clientName,
    p_requested_work: 'Freinage',
  });
  if (error) throw error;
  await client
    .from('clients')
    .update({ billing_address: '12 rue des Transporteurs, 95190 Goussainville', email })
    .eq('id', order.client_id ?? '');
  const work = await client.from('ro_lines').insert({
    repair_order_id: order.id,
    kind: 'done',
    line_type: 'labor',
    description: 'Remplacement disques avant',
    estimated_hours: 3,
  });
  if (work.error) throw work.error;
  const draft = await client.rpc('build_invoice_draft', { p_repair_order_ids: [order.id] });
  if (draft.error) throw draft.error;
  const issued = await client.rpc('issue_invoice', { p_invoice_id: draft.data });
  if (issued.error) throw issued.error;
  // Émise et échue il y a un mois (reprise de données : hors des règles de la facture émise)
  sql(
    `set rts.migration = 'on'; update public.invoices set issued_at = now() - interval '60 days',
     due_date = current_date - 30 where id = '${draft.data}'`,
  );
  return { id: draft.data, number: issued.data, clientId: order.client_id ?? '' };
}

test('relance groupée des retards : message prêt par client, relance notée sur la facture', async ({
  page,
}, testInfo) => {
  test.slow();
  const id = suffix(testInfo);
  const clientName = `Retard ${id}`;
  const invoice = await createOverdueInvoice(`R${id}`, clientName, `compta.${id.toLowerCase()}@exemple.fr`);

  await loginAs(page, 'reception@rts.local');
  await page.goto('/factures');
  await page.getByRole('button', { name: 'Relancer les retards' }).click();
  const dialog = page.getByRole('dialog', { name: 'Relancer les retards' });
  const list = dialog.getByRole('list', { name: 'Clients à relancer' });
  await expect(list.getByText(clientName)).toBeVisible();

  // Seul ce client : les autres retards de la base locale restent décochés (y compris ceux créés
  // par un autre test pendant que la fenêtre est ouverte)
  const boxes = list.getByRole('checkbox');
  const single = dialog.getByRole('button', { name: /^(Préparer|Envoyer) 1 relance$/ });
  await expect(async () => {
    for (let index = 0; index < (await boxes.count()); index++) {
      const box = boxes.nth(index);
      if ((await box.getAttribute('aria-label')) === `Relancer ${clientName}`) continue;
      if ((await box.isEnabled()) && (await box.isChecked())) await box.uncheck();
    }
    await expect(single).toBeVisible({ timeout: 1000 });
  }).toPass();
  await single.click();
  // Envoi par l'appli coupé en local : le message s'ouvre dans la messagerie
  const link = dialog.getByRole('link', { name: /Ouvrir dans la messagerie/ });
  await expect(link).toHaveAttribute(
    'href',
    new RegExp(`^mailto:compta\\.${id.toLowerCase()}@exemple\\.fr\\?`),
  );
  await expect(link).toHaveAttribute('href', new RegExp(encodeURIComponent(`Facture ${invoice.number}`)));
  expect(sql(`select count(*) from public.invoice_reminders where invoice_id = '${invoice.id}'`)).toBe('1');
});

test('mail préparé par l’Agent Direction : relu en entier, envoyé après « Envoyer »', async ({
  page,
}, testInfo) => {
  test.slow();
  const id = suffix(testInfo);
  const clientName = `Relance agent ${id}`;
  const invoice = await createOverdueInvoice(`A${id}`, clientName, `agent.${id.toLowerCase()}@exemple.fr`);
  const conversation = crypto.randomUUID();
  const action = crypto.randomUUID();
  // Ce que l'agent note quand il prépare la relance (outil preparer_mail)
  sql(
    `insert into public.agent_conversations (id, profile_id, title) values
       ('${conversation}', (select id from public.profiles where email = 'direction@rts.local'), 'Relance');
     insert into public.agent_turns (conversation_id, profile_id, question, answer) values
       ('${conversation}', (select id from public.profiles where email = 'direction@rts.local'),
        'Relance ${clientName}', 'Je prépare la relance de ${clientName}. Je l''envoie ?');
     insert into public.agent_actions (id, profile_id, conversation_id, kind, payload, summary) values
       ('${action}', (select id from public.profiles where email = 'direction@rts.local'), '${conversation}',
        'send_mail',
        '{"to": "agent.${id.toLowerCase()}@exemple.fr", "subject": "Facture ${invoice.number} en attente",
          "text": "Madame, Monsieur,\\nSauf erreur de notre part, la facture ${invoice.number} reste impayée.",
          "category": "billing", "invoice_ids": ["${invoice.id}"]}',
        'Relance à ${clientName} (agent.${id.toLowerCase()}@exemple.fr) : « Facture ${invoice.number} en attente », factures ${invoice.number}')`,
  );
  await page.route('**/functions/v1/agent', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.briefing) return route.fulfill({ status: 503, json: { error: 'Point du jour indisponible' } });
    await route.fulfill({
      json: {
        conversation_id: conversation,
        turn_id: null,
        answer: `Je prépare la relance de ${clientName}. Je l’envoie ?`,
        actions: [{ id: action, kind: 'send_mail', summary: 'Relance' }],
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
  await page.getByLabel('Question à l’agent').fill(`Relance ${clientName}`);
  await page.getByRole('button', { name: 'Envoyer la question' }).click();

  // Mail relu en entier, modifiable, envoyé seulement après « Envoyer »
  const card = page.getByRole('region', { name: 'Mails préparés' });
  await expect(card.getByLabel('À')).toHaveValue(`agent.${id.toLowerCase()}@exemple.fr`);
  await expect(card.getByLabel('Objet')).toHaveValue(`Facture ${invoice.number} en attente`);
  await expect(card.getByLabel('Texte')).toHaveValue(
    new RegExp(`Sauf erreur de notre part, la facture ${invoice.number} reste impayée.`),
  );
  await card.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await expect(card).toContainText(/Envoi dans \d s/);
  await expect.poll(() => sent.length, { timeout: 10_000 }).toBe(1);
  expect(sent[0]).toEqual({ agent_action_id: action, idempotency_key: action });
});
