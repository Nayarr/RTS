import { assertEquals, assertStringIncludes } from '@std/assert';
import {
  agentMailRequest,
  agentMailRequestSchema,
  attachmentsBytes,
  base64Bytes,
  mailHtml,
  mailText,
  requestSchema,
  resendFailure,
  resendPayload,
  senderAddress,
  senderFor,
  textToHtml,
  threadHeader,
} from './mail.ts';

const KEY = '7b0b7d4e-5b0e-4f3e-9c6a-2d1f0e9a8b7c';

Deno.test('requête : e-mail, objet, texte et clé obligatoires ; PDF seulement', () => {
  const ok = requestSchema.safeParse({
    to: 'client@exemple.fr',
    subject: 'Facture',
    text: 'Bonjour',
    idempotency_key: KEY,
  });
  assertEquals(ok.success, true);
  assertEquals(ok.success && ok.data.attachments, []);
  assertEquals(
    requestSchema.safeParse({ to: 'pas-un-email', subject: 'a', text: 'b', idempotency_key: KEY }).success,
    false,
  );
  assertEquals(
    requestSchema.safeParse({
      to: 'client@exemple.fr',
      subject: 'a',
      text: 'b',
      idempotency_key: KEY,
      attachments: [{ filename: 'virus.exe', content: 'AAAA' }],
    }).success,
    false,
  );
  assertEquals(
    requestSchema.safeParse({
      to: 'client@exemple.fr',
      subject: 'a',
      text: 'b',
      idempotency_key: KEY,
      attachments: [{ filename: '../F00012.pdf', content: 'AAAA' }],
    }).success,
    false,
  );
});

Deno.test('taille réelle des pièces jointes en base64', () => {
  assertEquals(base64Bytes(btoa('abc')), 3);
  assertEquals(base64Bytes(btoa('abcd')), 4);
  assertEquals(base64Bytes(btoa('abcde')), 5);
  assertEquals(
    attachmentsBytes([
      { filename: 'a.pdf', content: btoa('abcd') },
      { filename: 'b.pdf', content: btoa('ab') },
    ]),
    6,
  );
});

Deno.test('expéditeur au nom de l’atelier, sans caractère dangereux', () => {
  assertEquals(
    senderAddress('RAPID TRUCK SERVICE', 'atelier@rapidtruckservice.fr'),
    'RAPID TRUCK SERVICE <atelier@rapidtruckservice.fr>',
  );
  assertEquals(senderAddress('Garage "Le <Pro>"\r\n', 'a@b.fr'), 'Garage Le Pro <a@b.fr>');
  assertEquals(senderAddress('', 'a@b.fr'), 'a@b.fr');
});

Deno.test('HTML : texte échappé, liens cliquables, retours à la ligne', () => {
  const html = textToHtml(
    'Bonjour <client>,\n\nVotre facture : https://atelier.rapidtruckservice.fr/d/abc\nMerci & à bientôt',
  );
  assertStringIncludes(html, 'Bonjour &lt;client&gt;,<br>');
  assertStringIncludes(
    html,
    '<a href="https://atelier.rapidtruckservice.fr/d/abc">https://atelier.rapidtruckservice.fr/d/abc</a>',
  );
  assertStringIncludes(html, 'Merci &amp; à bientôt');
});

Deno.test('requête Resend : expéditeur, réponse vers l’atelier, pièces jointes', () => {
  const payload = resendPayload(
    {
      category: 'billing',
      to: 'client@exemple.fr',
      subject: 'Facture F00012',
      text: 'Bonjour',
      idempotency_key: KEY,
      attachments: [{ filename: 'F00012.pdf', content: 'JVBERi0=' }],
    },
    { name: 'RTS', address: 'atelier@rapidtruckservice.fr', replyTo: 'contact@rts.fr' },
  );
  assertEquals(payload.from, 'RTS <atelier@rapidtruckservice.fr>');
  assertEquals(payload.to, ['client@exemple.fr']);
  assertEquals(payload.reply_to, 'contact@rts.fr');
  assertEquals(payload.attachments, [{ filename: 'F00012.pdf', content: 'JVBERi0=' }]);

  const bare = resendPayload(
    {
      category: 'workshop',
      to: 'client@exemple.fr',
      subject: 'Rappel',
      text: 'Bonjour',
      idempotency_key: KEY,
      attachments: [],
    },
    { name: 'RTS', address: 'atelier@rapidtruckservice.fr', replyTo: null },
  );
  assertEquals('reply_to' in bare, false);
  assertEquals('attachments' in bare, false);
});

Deno.test('erreurs de Resend traduites pour le bureau', () => {
  assertEquals(resendFailure(422, 'Invalid `to` field').status, 400);
  assertStringIncludes(resendFailure(422, 'Invalid `to` field').error, 'Invalid `to` field');
  assertEquals(resendFailure(429, undefined).status, 429);
  assertEquals(resendFailure(403, 'domain not verified').status, 503);
  assertEquals(resendFailure(500, undefined).status, 502);
});

Deno.test('adresse d’envoi selon le type de message, domaine des réglages', () => {
  const settings = {
    mail_domain: 'rapidtruckservice.fr',
    mail_billing_local: 'facturation',
    mail_workshop_local: 'atelier',
    mail_signature_local: 'signature',
  };
  const fallback = { from: 'atelier@rapidtruckservice.fr', replyTo: 'contact@rts.fr' };
  assertEquals(senderFor('billing', settings, fallback), {
    address: 'facturation@rapidtruckservice.fr',
    replyTo: 'facturation@rapidtruckservice.fr',
  });
  assertEquals(senderFor('workshop', settings, fallback)?.address, 'atelier@rapidtruckservice.fr');
  assertEquals(senderFor('signature', settings, fallback)?.address, 'signature@rapidtruckservice.fr');
  // Sans domaine : adresse unique du secret, réponses vers l'e-mail de l'entreprise
  assertEquals(senderFor('billing', { ...settings, mail_domain: null }, fallback), {
    address: 'atelier@rapidtruckservice.fr',
    replyTo: 'contact@rts.fr',
  });
  assertEquals(
    senderFor('billing', { ...settings, mail_domain: null }, { from: undefined, replyTo: null }),
    null,
  );
});

Deno.test('type de message : atelier par défaut, valeur inconnue refusée', () => {
  const base = { to: 'client@exemple.fr', subject: 'a', text: 'b', idempotency_key: KEY };
  const parsed = requestSchema.safeParse(base);
  assertEquals(parsed.success && parsed.data.category, 'workshop');
  assertEquals(requestSchema.safeParse({ ...base, category: 'marketing' }).success, false);
});

Deno.test('lien du document : bouton entre le message et la signature, lien en clair dans le texte', () => {
  const link = { label: 'Consulter et signer le devis', url: 'https://atelier.rapidtruckservice.fr/d/abc' };
  const text = 'Bonjour,\n\nVotre devis est prêt.\n\nCordialement,\nRAPID TRUCK SERVICE';
  assertEquals(
    mailText(text, link),
    'Bonjour,\n\nVotre devis est prêt.\n\nConsulter et signer le devis : https://atelier.rapidtruckservice.fr/d/abc\n\nCordialement,\nRAPID TRUCK SERVICE',
  );
  const html = mailHtml(text, link);
  assertStringIncludes(html, '>Consulter et signer le devis</a>');
  assertEquals(html.indexOf('Votre devis est prêt') < html.indexOf('Consulter et signer'), true);
  assertEquals(html.indexOf('Consulter et signer') < html.indexOf('Cordialement'), true);
  assertEquals(mailText(text), text);
  assertEquals(
    requestSchema.safeParse({
      to: 'a@b.fr',
      subject: 'a',
      text: 'b',
      idempotency_key: KEY,
      link: { label: 'x', url: 'javascript:alert(1)' },
    }).success,
    false,
  );
});

Deno.test('réponse à un mail reçu : même fil chez le client, en-tête vérifié', () => {
  const request = requestSchema.parse({
    to: 'paul@fontaine-livraisons.fr',
    subject: 'Re: URGENT tracteur en panne',
    text: 'Bonjour,\nNous passons à 14 h.\nCordialement,\nRTS',
    idempotency_key: crypto.randomUUID(),
    inbox_email_id: crypto.randomUUID(),
  });
  const payload = resendPayload(request, {
    name: 'RTS',
    address: 'atelier@rapidtruckservice.fr',
    replyTo: null,
  }, '<abc@x.fr>');
  assertEquals(payload.headers, { 'In-Reply-To': '<abc@x.fr>', References: '<abc@x.fr>' });
  assertEquals('headers' in resendPayload(request, { name: 'RTS', address: 'a@b.fr', replyTo: null }), false);
  assertEquals(threadHeader(' <abc@x.fr> '), '<abc@x.fr>');
  assertEquals(threadHeader('<abc@x.fr>\r\nBcc: pirate@x.fr'), null);
  assertEquals(threadHeader(null), null);
});

Deno.test('mail préparé par l’agent : contenu relu dans l’action, adresse de facturation pour une relance', () => {
  const key = '3f6c2f47-6c2b-4b8e-9d0e-2a3c7b1d5e90';
  assertEquals(
    agentMailRequestSchema.safeParse({ agent_action_id: key, idempotency_key: key }).success,
    true,
  );
  assertEquals(
    agentMailRequest(
      {
        to: 'compta@martin.fr',
        subject: 'Facture F11887',
        text: 'Madame, Monsieur,',
        category: 'billing',
        invoice_ids: ['8d1b9a52-3c8e-4b3a-9f2a-6e7d1c2b3a4f'],
        client_name: 'Transports Martin',
      },
      key,
    ),
    {
      category: 'billing',
      to: 'compta@martin.fr',
      subject: 'Facture F11887',
      text: 'Madame, Monsieur,',
      attachments: [],
      idempotency_key: key,
    },
  );
  assertEquals(
    agentMailRequest({ to: 'pas-une-adresse', subject: 'x', text: 'y', category: 'billing' }, key),
    null,
  );
  assertEquals(agentMailRequest({ to: 'a@b.fr', subject: 'x', text: 'y', category: 'signature' }, key), null);
});
