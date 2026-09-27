import { assertEquals, assertStringIncludes } from '@std/assert';
import { contentDisposition, objectPath, ObjectStorage, storageConfigFromEnv } from './storage.ts';

const env = (values: Record<string, string>) => (name: string) => values[name];

Deno.test('configuration : incomplète → null', () => {
  assertEquals(storageConfigFromEnv(env({ R2_ENDPOINT: 'https://r2.example' })), null);
});

Deno.test('configuration : point d’accès public par défaut = point d’accès R2', () => {
  const config = storageConfigFromEnv(
    env({
      R2_ENDPOINT: 'https://compte.r2.cloudflarestorage.com/',
      R2_ACCESS_KEY_ID: 'id',
      R2_SECRET_ACCESS_KEY: 'secret',
      R2_BUCKET: 'rts-atelier',
    }),
  );
  assertEquals(config?.endpoint, 'https://compte.r2.cloudflarestorage.com');
  assertEquals(config?.publicEndpoint, 'https://compte.r2.cloudflarestorage.com');
});

Deno.test('chemin d’objet encodé segment par segment', () => {
  assertEquals(
    objectPath('rts-atelier', 'ro_photo/2026/09/a b.jpg'),
    '/rts-atelier/ro_photo/2026/09/a%20b.jpg',
  );
});

Deno.test('Content-Disposition avec nom accentué', () => {
  assertEquals(contentDisposition(null), 'inline');
  assertEquals(
    contentDisposition('Facture n°12 "été".pdf', 'attachment'),
    `attachment; filename="Facture n_12 _ete_.pdf"; filename*=UTF-8''Facture%20n%C2%B012%20%22%C3%A9t%C3%A9%22.pdf`,
  );
});

Deno.test('URL d’envoi signée : type imposé, durée limitée, point d’accès public', async () => {
  const storage = new ObjectStorage({
    endpoint: 'http://rts-storage:7070',
    publicEndpoint: 'http://localhost:9000',
    accessKeyId: 'id',
    secretAccessKey: 'secret',
    bucket: 'rts-atelier',
  });
  const url = new URL(
    await storage.presign('PUT', 'rts-atelier', 'ro_photo/x.jpg', 600, {
      headers: { 'Content-Type': 'image/jpeg' },
    }),
  );
  assertEquals(url.origin + url.pathname, 'http://localhost:9000/rts-atelier/ro_photo/x.jpg');
  assertEquals(url.searchParams.get('X-Amz-Expires'), '600');
  assertStringIncludes(url.searchParams.get('X-Amz-SignedHeaders') ?? '', 'content-type');
});
