import { assertEquals, assertStringIncludes } from '@std/assert';
import { buildAutoMail, frenchDay } from './messages.ts';

const context = {
  companyName: 'RAPID TRUCK SERVICE',
  phone: '01 39 00 00 00',
  appUrl: 'https://atelier.exemple.fr/',
};

Deno.test('jour en toutes lettres', () => {
  assertEquals(frenchDay('2026-10-14'), 'mercredi 14 octobre');
});

Deno.test('rappel la veille : jour, heure, véhicule, téléphone de l’atelier', () => {
  const mail = buildAutoMail(
    {
      key: 'k',
      kind: 'appointment_reminder',
      to: 'client@exemple.fr',
      client_name: 'Transports Martin',
      plate: 'AB-123-CD',
      reason: 'Vidange',
      date: '2026-10-14',
      time: '09:30',
    },
    context,
  );
  assertEquals(mail?.subject, 'Rappel : votre rendez-vous demain à 9h30');
  assertStringIncludes(
    mail!.text,
    'demain, mercredi 14 octobre à 9h30 pour votre véhicule AB-123-CD (vidange)',
  );
  assertStringIncludes(mail!.text, '01 39 00 00 00');
  assertEquals(mail?.link, undefined);
});

Deno.test('confirmation d’un rendez-vous demandé en ligne', () => {
  const mail = buildAutoMail(
    {
      key: 'k',
      kind: 'appointment_confirmed',
      to: 'client@exemple.fr',
      reason: 'Contrôle technique (demandé en ligne)',
      date: '2026-10-14',
      time: '14:00',
    },
    context,
  );
  assertEquals(mail?.subject, 'Rendez-vous confirmé : mercredi 14 octobre à 14h00');
  assertStringIncludes(mail!.text, '(contrôle technique)');
});

Deno.test('échéance : date, lien de prise de rendez-vous ; hayon au mois', () => {
  const mail = buildAutoMail(
    {
      key: 'k',
      kind: 'ct',
      to: 'client@exemple.fr',
      plate: 'AB-123-CD',
      reason: 'Contrôle technique',
      due_date: '2026-10-16',
      token: 'abc',
    },
    context,
  );
  assertEquals(mail?.subject, 'Contrôle technique de AB-123-CD : échéance le 16/10/2026');
  assertStringIncludes(
    mail!.text,
    'Le contrôle technique de votre véhicule AB-123-CD arrive à échéance le 16/10/2026',
  );
  assertEquals(mail?.link, {
    label: 'Prendre rendez-vous',
    url: 'https://atelier.exemple.fr/rdv/abc',
  });

  // Hayon : seulement le mois et l'année (valable jusqu'à la fin du mois)
  const tailgate = buildAutoMail(
    {
      key: 'k2',
      kind: 'tailgate',
      to: 'client@exemple.fr',
      plate: 'AB-123-CD',
      reason: 'Contrôle hayon',
      due_date: '2026-05-01',
      token: 'abc',
    },
    context,
  );
  assertEquals(tailgate?.subject, 'Contrôle hayon de AB-123-CD : échéance fin mai 2026');
  assertStringIncludes(tailgate!.text, 'arrive à échéance fin mai 2026 : il doit être refait.');
});

Deno.test('fin de location : date, reconduction tacite annoncée', () => {
  const mail = buildAutoMail(
    {
      key: 'k',
      kind: 'rental_end',
      to: 'c@e.fr',
      client_name: 'Julie Martin',
      number: 'LC-2026-0004',
      plate: 'GE-781-UV',
      date: '2026-10-14',
      time: '18:00',
      tacit_renewal: true,
      unit: 'un mois',
    },
    context,
  );
  assertEquals(mail?.subject, 'Fin de votre location le mercredi 14 octobre à 18h00');
  assertStringIncludes(mail!.text, 'Votre location LC-2026-0004 (véhicule GE-781-UV) se termine');
  assertStringIncludes(mail!.text, 'reconduit tacitement d’un mois');
});

Deno.test('entretien de contrat ; sans adresse de l’appli, pas d’e-mail d’échéance', () => {
  const item = { key: 'k', kind: 'maintenance' as const, to: 'c@e.fr', plate: 'AB-123-CD', token: 'abc' };
  assertStringIncludes(
    buildAutoMail(item, context)!.text,
    'L’entretien prévu dans votre contrat pour AB-123-CD',
  );
  assertEquals(buildAutoMail(item, { ...context, appUrl: null }), null);
});
