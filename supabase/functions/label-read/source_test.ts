import { assertEquals } from '@std/assert';
import { sourceBlock } from './source.ts';

Deno.test('fichier lu : photo en image, PDF en document, autre format refusé', () => {
  assertEquals(sourceBlock('image/jpeg', 'AAAA')?.type, 'image');
  assertEquals(sourceBlock('application/pdf', 'AAAA'), {
    type: 'document',
    source: { type: 'base64', media_type: 'application/pdf', data: 'AAAA' },
  });
  assertEquals(sourceBlock('image/heic', 'AAAA'), null);
});
