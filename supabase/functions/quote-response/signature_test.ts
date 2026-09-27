import { assertEquals } from '@std/assert';
import { decodeSignature, MAX_SIGNATURE_BYTES, signatureKey } from './signature.ts';

// PNG 1×1 transparent
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

Deno.test('signature : PNG en data URL décodée', () => {
  const bytes = decodeSignature(`data:image/png;base64,${PNG}`);
  assertEquals(bytes?.length, 70);
  assertEquals(bytes?.[1], 0x50); // « P » de PNG
});

Deno.test('signature : autre type, base64 invalide ou faux PNG refusés', () => {
  assertEquals(decodeSignature(`data:image/jpeg;base64,${PNG}`), null);
  assertEquals(decodeSignature('data:image/png;base64,%%%'), null);
  assertEquals(decodeSignature(`data:image/png;base64,${btoa('<svg onload=alert(1)>')}`), null);
});

Deno.test('signature : taille limitée', () => {
  const big = new Uint8Array(MAX_SIGNATURE_BYTES + 1);
  big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let binary = '';
  for (const byte of big) binary += String.fromCharCode(byte);
  assertEquals(decodeSignature(`data:image/png;base64,${btoa(binary)}`), null);
});

Deno.test('signature : rangée comme les autres fichiers', () => {
  assertEquals(signatureKey(new Date('2026-09-27T10:00:00Z'), 'abc'), 'signature/2026/09/abc.png');
});
