import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { sql } from './support/db';
import { goTo } from './support/nav';

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
  `${String(Date.now()).slice(-5)}${Math.floor(Math.random() * 90 + 10)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;

test('mail d’un client qui confirme son contrôle technique : fiche du véhicule mise à jour en un clic', async ({
  page,
}, testInfo) => {
  const id = suffix(testInfo);
  const plate = `CT${id}`;
  // Client et camion au contrôle technique dans 3 jours
  const vehicleId =
    sql(`with c as (insert into public.clients (name, email) values ('Flotte ${id}', 'parc.${id.toLowerCase()}@exemple.fr') returning id)
       insert into public.vehicles (plate, client_id, vehicle_type, ct_due_date)
       select '${plate}', c.id, 'pl'::public.vehicle_type, current_date + 3 from c returning id`).split(
      '\n',
    )[0];
  // Mail reçu et trié (écrit par l'Edge Function mail-inbox), date relevée par le tri
  const mailId =
    sql(`insert into public.inbox_emails (provider_id, mailbox, from_name, from_address, subject, body,
       received_at, client_id, triage_status, category, urgency, summary, needs_reply)
     select 'e2e-${id}', 'atelier@rapidtruckservice.fr', 'Parc ${id}', 'parc.${id.toLowerCase()}@exemple.fr',
            'CT ${plate} fait', 'Bonjour, le contrôle technique de ${plate} est fait, valable un an.', now(), v.client_id,
            'done', 'administratif', 'faible', 'Contrôle technique de ${plate} renouvelé.', false
     from public.vehicles v where v.id = '${vehicleId}' returning id`).split('\n')[0];
  sql(`select public.propose_inbox_deadline_updates('${mailId}',
       jsonb_build_array(jsonb_build_object('immatriculation', '${plate}', 'controle', 'ct', 'date', current_date + 365)))`);
  const nextYear = sql(`select to_char(current_date + 365, 'DD/MM/YYYY')`);

  await loginAs(page, 'reception@rts.local');
  await goTo(page, null, 'Mails reçus');
  const row = page.getByRole('button', { name: new RegExp(`CT ${plate} fait.*Échéance à mettre à jour`) });
  await row.click();
  const card = page.getByRole('region', { name: 'Échéances proposées' });
  await expect(card).toContainText(`${plate} : contrôle technique au ${nextYear}`);
  await card.getByRole('button', { name: 'Mettre à jour' }).click();
  await expect(page.getByText('Fiches des véhicules mises à jour')).toBeVisible();
  await expect(card).toContainText('Fiche du véhicule mise à jour');
  expect(sql(`select ct_due_date = current_date + 365 from public.vehicles where id = '${vehicleId}'`)).toBe(
    't',
  );
});
