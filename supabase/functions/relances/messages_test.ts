import { assertEquals, assertMatch, assertStringIncludes } from '@std/assert';
import { buildReminderMail, frDate, type ReminderItem } from './messages.ts';

const item = (overrides: Partial<ReminderItem> = {}): ReminderItem => ({
  client_id: 'c1',
  client_name: 'Transports Dupont',
  to: 'compta@dupont.fr',
  level: 1,
  balance: 180,
  invoices: [
    {
      invoice_id: 'i1',
      number: 'F11900',
      issued_at: '2026-10-01T09:00:00Z',
      due_date: '2026-10-01',
      vehicle_label: 'AB-123-CD',
      balance_due: 120,
      token: 'tok1',
    },
    {
      invoice_id: 'i2',
      number: 'F11950',
      issued_at: '2026-10-15T09:00:00Z',
      due_date: '2026-10-15',
      vehicle_label: null,
      balance_due: 60,
      token: 'tok2',
    },
  ],
  ...overrides,
});

const context = {
  companyName: 'Rapid Truck Service',
  phone: '01 30 00 00 00',
  email: 'atelier@rapidtruckservice.fr',
  appUrl: 'https://app.test/',
};

Deno.test('dates en français', () => {
  assertEquals(frDate('2026-11-09'), '09/11/2026');
  assertEquals(frDate('2026-11-09T08:00:00Z'), '09/11/2026');
  assertEquals(frDate(null), '');
});

Deno.test('1re relance : cordiale, toutes les factures du client avec leur lien', () => {
  const mail = buildReminderMail(item(), context);
  assertEquals(mail.subject, 'Relance · Factures en attente de règlement · Rapid Truck Service');
  assertStringIncludes(mail.text, 'Sauf erreur de notre part, les factures suivantes restent impayées');
  assertStringIncludes(
    mail.text,
    '- Facture F11900 du 01/10/2026 (véhicule AB-123-CD), échue le 01/10/2026 : 120,00 € TTC\n  https://app.test/d/tok1',
  );
  assertStringIncludes(mail.text, 'Total restant dû : 180,00 € TTC.');
  assertStringIncludes(mail.text, 'Pour toute question : 01 30 00 00 00 · atelier@rapidtruckservice.fr.');
});

Deno.test('2e relance : ferme, une seule facture', () => {
  const mail = buildReminderMail(item({ level: 2, balance: 120, invoices: [item().invoices[0]!] }), context);
  assertEquals(mail.subject, '2e relance · Facture F11900 toujours impayée · Rapid Truck Service');
  assertStringIncludes(mail.text, 'Malgré notre précédente relance, la facture suivante reste impayée');
  assertStringIncludes(mail.text, 'sous 8 jours');
});

Deno.test('3e relance : dernier rappel avant recouvrement', () => {
  const mail = buildReminderMail(item({ level: 3 }), context);
  assertMatch(mail.subject, /^Dernier rappel avant recouvrement/);
  assertStringIncludes(mail.text, 'procédure de recouvrement');
});

Deno.test('sans adresse de l’appli : pas de lien', () => {
  const mail = buildReminderMail(item(), { ...context, appUrl: null });
  assertEquals(mail.text.includes('/d/'), false);
});
