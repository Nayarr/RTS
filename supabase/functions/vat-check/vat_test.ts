import { assertEquals } from '@std/assert';
import { formatOk, isEuVat, normalizeVat, registeredName, requestSchema, viesRequest } from './vat.ts';

Deno.test('n° de TVA : forme enregistrée sans espaces ni ponctuation', () => {
  assertEquals(normalizeVat('fr 66 984.989.137'), 'FR66984989137');
  assertEquals(normalizeVat('CHE-123.456.789 MWST'), 'CHE123456789MWST');
});

Deno.test('Union européenne vérifiée par VIES, ailleurs format contrôlé', () => {
  assertEquals(isEuVat('DE123456789'), true);
  assertEquals(isEuVat('EL123456789'), true);
  assertEquals(isEuVat('CHE123456789'), false);
  assertEquals(formatOk('CHE123456789MWST'), true);
  assertEquals(formatOk('CHE12345'), false);
  assertEquals(formatOk('GB123456789'), true);
  assertEquals(formatOk('GB12345'), false);
  assertEquals(formatOk('NO123456789MVA'), true);
  assertEquals(formatOk('MA12345678'), true);
  assertEquals(formatOk('1234'), false);
});

Deno.test('demande à VIES : pays et numéro sans le préfixe ; raison sociale lisible', () => {
  assertEquals(viesRequest('DE123456789'), { countryCode: 'DE', vatNumber: '123456789' });
  assertEquals(registeredName('---'), null);
  assertEquals(registeredName(' TRANSPORTE GMBH '), 'TRANSPORTE GMBH');
  assertEquals(requestSchema.safeParse({ vat_number: 'DE123456789' }).success, true);
  assertEquals(requestSchema.safeParse({ vat_number: 'DE' }).success, false);
});
