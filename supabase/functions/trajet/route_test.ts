import { assertEquals } from '@std/assert';
import { requestSchema, roundTrip, routeUrl } from './route.ts';

Deno.test('calcul d’itinéraire : voiture, trafic compris, départ maintenant ou prévu', () => {
  const url = new URL(
    routeUrl('https://api.example/route', 'cle', { lat: 48.99, lon: 2.47 }, { lat: 49.01, lon: 2.55 }, null),
  );
  assertEquals(url.pathname, '/route/48.99,2.47:49.01,2.55/json');
  assertEquals(url.searchParams.get('traffic'), 'true');
  assertEquals(url.searchParams.get('travelMode'), 'car');
  assertEquals(url.searchParams.get('departAt'), 'now');
  const planned = new URL(
    routeUrl(
      'https://api.example/route',
      'cle',
      { lat: 1, lon: 2 },
      { lat: 3, lon: 4 },
      '2026-10-26T08:00:00+01:00',
    ),
  );
  assertEquals(planned.searchParams.get('departAt'), '2026-10-26T08:00:00+01:00');
});

Deno.test('aller-retour : km au dixième, minutes arrondies', () => {
  assertEquals(roundTrip([{ meters: 7_840, seconds: 1_150 }, { meters: 8_010, seconds: 1_290 }]), {
    km: 15.9,
    minutes: 41,
  });
});

Deno.test('demande : coordonnées de l’atelier et du lieu', () => {
  assertEquals(
    requestSchema.safeParse({ from: { lat: 48.99, lon: 2.47 }, to: { lat: 49, lon: 2.5 } }).success,
    true,
  );
  assertEquals(
    requestSchema.safeParse({ from: { lat: 148, lon: 2 }, to: { lat: 49, lon: 2.5 } }).success,
    false,
  );
});
