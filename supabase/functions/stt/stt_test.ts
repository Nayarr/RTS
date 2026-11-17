import { assertEquals } from '@std/assert';
import { isExpectedWav, MAX_AUDIO_BYTES, parseRecognition, SAMPLE_RATE, sttUrl } from './stt.ts';

/** WAV PCM 16 bits, comme celui de l'appli (en-tête de 44 octets puis les échantillons). */
function wav(samples: number, { rate = SAMPLE_RATE, channels = 1, bits = 16, format = 1 } = {}) {
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const write = (offset: number, text: string) =>
    [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  write(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, bits, true);
  write(36, 'data');
  view.setUint32(40, samples * 2, true);
  return bytes;
}

Deno.test('adresse Azure de la région, en français, résultat détaillé', () => {
  assertEquals(
    sttUrl('francecentral'),
    'https://francecentral.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1' +
      '?language=fr-FR&format=detailed&profanity=raw',
  );
  assertEquals(sttUrl('france central'), null);
  assertEquals(sttUrl(''), null);
});

Deno.test('enregistrement accepté : WAV PCM 16 bits mono 16 kHz, 30 s au plus', () => {
  assertEquals(isExpectedWav(wav(16_000)), true);
  assertEquals(isExpectedWav(wav(0)), false);
  assertEquals(isExpectedWav(wav(16_000, { rate: 48_000 })), false);
  assertEquals(isExpectedWav(wav(16_000, { channels: 2 })), false);
  assertEquals(isExpectedWav(wav(16_000, { bits: 8 })), false);
  assertEquals(isExpectedWav(wav(16_000, { format: 3 })), false);
  assertEquals(isExpectedWav(wav((MAX_AUDIO_BYTES - 44) / 2)), true);
  assertEquals(isExpectedWav(wav((MAX_AUDIO_BYTES - 44) / 2 + 1)), false);
  assertEquals(isExpectedWav(new TextEncoder().encode('pas un enregistrement '.repeat(5))), false);
});

Deno.test('réponse d’Azure : meilleure version et autres versions, sans doublon', () => {
  assertEquals(
    parseRecognition({
      RecognitionStatus: 'Success',
      DisplayText: 'Quelles factures sont en retard ?',
      NBest: [
        { Display: 'Quelles factures sont en retard ?' },
        { Display: 'Quels factures sont en retard ?' },
        { Display: 'Quelles factures sont en retard ?' },
        { Display: 'Quelle facture est en retard ?' },
        { Display: 'Quelles factures son en retard ?' },
        { Display: 'Quelles fractures sont en retard ?' },
      ],
    }),
    {
      status: 'ok',
      text: 'Quelles factures sont en retard ?',
      alternatives: [
        'Quels factures sont en retard ?',
        'Quelle facture est en retard ?',
        'Quelles factures son en retard ?',
      ],
    },
  );
  assertEquals(parseRecognition({ RecognitionStatus: 'Success', DisplayText: ' Bonjour. ' }), {
    status: 'ok',
    text: 'Bonjour.',
    alternatives: [],
  });
});

Deno.test('réponse d’Azure : silence ou bruit, erreur, réponse illisible', () => {
  for (const status of ['NoMatch', 'InitialSilenceTimeout', 'BabbleTimeout']) {
    assertEquals(parseRecognition({ RecognitionStatus: status }), { status: 'silence' });
  }
  assertEquals(parseRecognition({ RecognitionStatus: 'Success', DisplayText: '' }), { status: 'silence' });
  assertEquals(parseRecognition({ RecognitionStatus: 'Error' }), { status: 'error' });
  assertEquals(parseRecognition(null), { status: 'error' });
  assertEquals(parseRecognition({ DisplayText: 'sans statut' }), { status: 'error' });
});
