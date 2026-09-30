import { assertEquals, assertExists, assertMatch } from '@std/assert';
import { encodeBase64Url } from '@std/encoding/base64url';
import { createPushServer, importVapidKeys, pushConfigFromEnv, pushPayload, sendPush } from './push.ts';

/** Clés VAPID de test, au format de « web-push generate-vapid-keys ». */
async function testVapidConfig() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  return { publicKey: encodeBase64Url(raw), privateKey: jwk.d!, subject: 'mailto:atelier@test.fr' };
}

/** Abonnement d'un navigateur fictif (clé ECDH P-256 + secret d'authentification). */
async function testTarget(endpoint: string) {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return {
    endpoint,
    p256dh: encodeBase64Url(raw),
    auth: encodeBase64Url(crypto.getRandomValues(new Uint8Array(16))),
  };
}

/** Service de push simulé (fetch remplacé) : enregistre les en-têtes et répond avec le statut demandé. */
function fakePushService(status: number) {
  const received: Headers[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    received.push(new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)));
    return Promise.resolve(new Response(null, { status }));
  };
  return {
    url: 'https://push.example/push/abc',
    received,
    close: () => {
      globalThis.fetch = realFetch;
    },
  };
}

const message = { title: 'Nouvel OR : AB-123-CD', body: 'Freins', link: '/atelier/or/1', tag: 'ro-1' };

Deno.test('configuration : incomplète → null', () => {
  assertEquals(
    pushConfigFromEnv((name) => ({ VAPID_PUBLIC_KEY: 'x' } as Record<string, string>)[name]),
    null,
  );
});

Deno.test('clés VAPID importées depuis le format base64url', async () => {
  const keys = await importVapidKeys(await testVapidConfig());
  assertEquals(keys.privateKey.type, 'private');
  assertEquals(keys.publicKey.type, 'public');
});

Deno.test('contenu lu par le service worker', () => {
  assertEquals(JSON.parse(pushPayload({ title: 'T', body: null, link: null, tag: null })), {
    title: 'T',
    body: '',
    link: '/',
    tag: null,
  });
});

Deno.test('envoi chiffré avec signature VAPID', async () => {
  const service = fakePushService(201);
  try {
    const server = await createPushServer(await testVapidConfig());
    assertEquals(await sendPush(server, await testTarget(service.url), message), 'delivered');
    const headers = service.received[0];
    assertExists(headers);
    assertMatch(headers.get('authorization') ?? '', /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);
    assertEquals(headers.get('content-encoding'), 'aes128gcm');
    assertEquals(headers.get('ttl'), '86400');
    assertEquals(headers.get('urgency'), 'high');
  } finally {
    service.close();
  }
});

Deno.test('appareil désabonné (410, 404) → gone ; panne du service (500) → retry', async () => {
  const server = await createPushServer(await testVapidConfig());
  for (
    const [status, outcome] of [
      [410, 'gone'],
      [404, 'gone'],
      [500, 'retry'],
    ] as const
  ) {
    const service = fakePushService(status);
    try {
      assertEquals(await sendPush(server, await testTarget(service.url), message), outcome);
    } finally {
      service.close();
    }
  }
});
