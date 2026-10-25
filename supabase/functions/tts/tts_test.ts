import { assertEquals } from '@std/assert';
import { azureUrl, escapeXml, MAX_CHARACTERS, requestSchema, ssml, VOICES } from './tts.ts';

Deno.test('SSML : voix française, texte échappé (aucune balise injectée)', () => {
  assertEquals(
    ssml('Facture <F11887> & « reste dû »', 'fr-FR-DeniseNeural'),
    '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="fr-FR">' +
      '<voice name="fr-FR-DeniseNeural">Facture &lt;F11887&gt; &amp; « reste dû »</voice></speak>',
  );
  assertEquals(escapeXml(`l'OR "488"`), 'l&apos;OR &quot;488&quot;');
});

Deno.test('SSML : voix multilingue (Ximena) lue en français de France', () => {
  assertEquals(
    ssml('Bonjour', 'es-ES-XimenaMultilingualNeural'),
    '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="fr-FR">' +
      '<voice name="es-ES-XimenaMultilingualNeural"><lang xml:lang="fr-FR">Bonjour</lang></voice></speak>',
  );
});

Deno.test('demande de lecture : texte de 2 000 caractères au plus, voix de la liste', () => {
  assertEquals(requestSchema.safeParse({ text: 'Bonjour' }).success, true);
  assertEquals(requestSchema.safeParse({ text: '  ' }).success, false);
  assertEquals(requestSchema.safeParse({ text: 'x'.repeat(MAX_CHARACTERS + 1) }).success, false);
  assertEquals(requestSchema.safeParse({ text: 'Essai', voice: 'fr-FR-HenriNeural' }).success, true);
  assertEquals(requestSchema.safeParse({ text: 'Essai', voice: 'en-US-JennyNeural' }).success, false);
  assertEquals(VOICES[0], 'es-ES-XimenaMultilingualNeural');
});

Deno.test('adresse Azure de la région, région invalide refusée', () => {
  assertEquals(
    azureUrl('francecentral'),
    'https://francecentral.tts.speech.microsoft.com/cognitiveservices/v1',
  );
  assertEquals(azureUrl('evil.com/x'), null);
});
