import { assertEquals } from '@std/assert';
import { isCronRequest, sameSecret } from './cron.ts';

const SECRET = 'secret-de-test-assez-long';
const request = (headers: Record<string, string> = {}) =>
  new Request('http://localhost/functions/v1/files-purge', { method: 'POST', headers });

Deno.test('secret identique uniquement', () => {
  assertEquals(sameSecret(SECRET, SECRET), true);
  assertEquals(sameSecret(`${SECRET}x`, SECRET), false);
  assertEquals(sameSecret('', SECRET), false);
  assertEquals(sameSecret(SECRET.replace('t', 'T'), SECRET), false);
});

Deno.test('tâche planifiée reconnue par son en-tête', () => {
  assertEquals(isCronRequest(request({ 'x-cron-secret': SECRET }), SECRET), true);
  assertEquals(isCronRequest(request({ 'x-cron-secret': 'autre' }), SECRET), false);
  assertEquals(isCronRequest(request(), SECRET), false);
});

Deno.test('secret absent ou trop court côté fonction : toujours refusé', () => {
  assertEquals(isCronRequest(request({ 'x-cron-secret': '' }), undefined), false);
  assertEquals(isCronRequest(request({ 'x-cron-secret': 'court' }), 'court'), false);
});
