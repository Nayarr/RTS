import { assertEquals, assertStringIncludes } from '@std/assert';
import {
  attachmentsBytes,
  base64Bytes,
  requestSchema,
  resendFailure,
  resendPayload,
  senderAddress,
  textToHtml,
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
    senderAddress('RAPID TRUCK SERVICE', 'atelier@cylindre.fr'),
    'RAPID TRUCK SERVICE <atelier@cylindre.fr>',
  );
  assertEquals(senderAddress('Garage "Le <Pro>"\r\n', 'a@b.fr'), 'Garage Le Pro <a@b.fr>');
  assertEquals(senderAddress('', 'a@b.fr'), 'a@b.fr');
});

Deno.test('HTML : texte échappé, liens cliquables, retours à la ligne', () => {
  const html = textToHtml(
    'Bonjour <client>,\n\nVotre facture : https://app.cylindre.fr/d/abc\nMerci & à bientôt',
  );
  assertStringIncludes(html, 'Bonjour &lt;client&gt;,<br>');
  assertStringIncludes(html, '<a href="https://app.cylindre.fr/d/abc">https://app.cylindre.fr/d/abc</a>');
  assertStringIncludes(html, 'Merci &amp; à bientôt');
});

Deno.test('requête Resend : expéditeur, réponse vers l’atelier, pièces jointes', () => {
  const payload = resendPayload(
    {
      to: 'client@exemple.fr',
      subject: 'Facture F00012',
      text: 'Bonjour',
      idempotency_key: KEY,
      attachments: [{ filename: 'F00012.pdf', content: 'JVBERi0=' }],
    },
    { name: 'RTS', address: 'atelier@cylindre.fr', replyTo: 'contact@rts.fr' },
  );
  assertEquals(payload.from, 'RTS <atelier@cylindre.fr>');
  assertEquals(payload.to, ['client@exemple.fr']);
  assertEquals(payload.reply_to, 'contact@rts.fr');
  assertEquals(payload.attachments, [{ filename: 'F00012.pdf', content: 'JVBERi0=' }]);

  const bare = resendPayload(
    { to: 'client@exemple.fr', subject: 'Rappel', text: 'Bonjour', idempotency_key: KEY, attachments: [] },
    { name: 'RTS', address: 'atelier@cylindre.fr', replyTo: null },
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
