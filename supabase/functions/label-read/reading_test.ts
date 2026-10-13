import { assertEquals, assertMatch } from '@std/assert';
import { inspectionReadingPrompt, validPlate, validVin } from './inspection-reading.ts';
import { addMonths, nextDueDate, readingPrompt, validDate } from './reading.ts';
import { checkedLicense, licenseReadingPrompt } from './license-reading.ts';
import { checkedRegistration, registrationReadingPrompt } from './registration-reading.ts';

const TODAY = '2026-10-02';
const reading = (next: string, last: string) => ({
  next_due_date: next,
  last_control_date: last,
  label_text: '',
  confidence: 'haute' as const,
});

Deno.test('dates : seules les vraies dates plausibles sont gardées', () => {
  assertEquals(validDate('2027-03-31', TODAY), '2027-03-31');
  assertEquals(validDate(' 2026-04-15 ', TODAY), '2026-04-15');
  assertEquals(validDate('2027-02-30', TODAY), null); // 30 février
  assertEquals(validDate('31/03/2027', TODAY), null);
  assertEquals(validDate('1999-12-31', TODAY), null);
  assertEquals(validDate('2045-01-01', TODAY), null);
  assertEquals(validDate('', TODAY), null);
});

Deno.test('ajout de mois : reste sur un jour qui existe', () => {
  assertEquals(addMonths('2026-04-15', 6), '2026-10-15');
  assertEquals(addMonths('2026-08-31', 6), '2027-02-28');
  assertEquals(addMonths('2027-08-31', 6), '2028-02-29');
});

Deno.test('échéance : lue sur l’étiquette, sinon dernier contrôle + 6 mois', () => {
  assertEquals(nextDueDate(reading('2027-03-31', '2026-09-01'), TODAY), '2027-03-31');
  assertEquals(nextDueDate(reading('', '2026-09-01'), TODAY), '2027-03-01');
  assertEquals(nextDueDate(reading('illisible', ''), TODAY), null);
});

Deno.test('consigne : date du jour et format attendu', () => {
  const prompt = readingPrompt(TODAY);
  assertEquals(prompt.includes('Nous sommes le 2026-10-02.'), true);
  assertEquals(prompt.includes('AAAA-MM-JJ'), true);
});

Deno.test('contrôle technique : VIN de 17 caractères sans I, O ni Q', () => {
  assertEquals(validVin('vf6 1234-5678 901234'), 'VF612345678901234');
  assertEquals(validVin('VF61234567890123O'), null);
  assertEquals(validVin('VF6123'), null);
  assertEquals(validVin(''), null);
  const prompt = inspectionReadingPrompt(TODAY);
  assertEquals(prompt.includes('à présenter avant le'), true);
  assertEquals(prompt.includes('VIN'), true);
});

Deno.test('vignette : immatriculation et VIN seulement, « numéro de série » = VIN', () => {
  const prompt = inspectionReadingPrompt(TODAY);
  assertEquals(prompt.includes('lis uniquement l’immatriculation et le VIN'), true);
  assertEquals(prompt.includes('« numéro de série »'), true);
  assertEquals(validPlate('ab 123 cd'), 'AB-123-CD');
  assertEquals(validPlate('1234 AB 95'), '1234AB95');
  assertEquals(validPlate('?'), null);
});

Deno.test('permis : valeurs lues contrôlées (dates, numéro, catégories), permis expiré gardé', () => {
  const read = checkedLicense(
    {
      civility: 'Mme',
      last_name: ' MARTIN ',
      first_name: 'Julie',
      birth_date: '1991-03-14',
      birth_place: 'Pontoise',
      license_number: '9103 9520 0123',
      issued_on: '2010-06-22',
      valid_until: '2024-06-22',
      categories: ['B', 'BE', 'B', 'C'],
      confidence: 'haute',
    },
    TODAY,
  );
  assertEquals(read, {
    civility: 'Mme',
    last_name: 'MARTIN',
    first_name: 'Julie',
    birth_date: '1991-03-14',
    birth_place: 'Pontoise',
    license_number: '910395200123',
    issued_on: '2010-06-22',
    valid_until: '2024-06-22',
    categories: ['B', 'BE', 'C'],
    confidence: 'haute',
  });
  const blurry = checkedLicense(
    {
      ...read,
      civility: '',
      birth_date: '2030-01-01',
      license_number: '12',
      issued_on: '22/06/2010',
      valid_until: '',
    },
    TODAY,
  );
  assertEquals([
    blurry.civility,
    blurry.birth_date,
    blurry.license_number,
    blurry.issued_on,
    blurry.valid_until,
  ], [
    null,
    null,
    null,
    null,
    null,
  ]);
  assertMatch(licenseReadingPrompt(TODAY), /Nous sommes le 2026-10-02/);
});

Deno.test('carte grise : plaque, VIN, date, catégorie et carburant reconnus', () => {
  const read = checkedRegistration(
    {
      plate: 'ge 781 uv',
      first_registration: '2021-04-12',
      brand: ' RENAULT ',
      model: 'MASTER',
      vin: 'VF1MA000123456789',
      genre: 'CTTE',
      energy: 'GO',
      confidence: 'haute',
    },
    TODAY,
  );
  assertEquals(read, {
    plate: 'GE-781-UV',
    first_registration: '2021-04-12',
    brand: 'RENAULT',
    model: 'MASTER',
    vin: 'VF1MA000123456789',
    category: 'van',
    fuel_type: 'Gazole',
    confidence: 'haute',
  });
  const tractor = checkedRegistration(
    {
      ...read,
      plate: '?',
      first_registration: '2099-01-01',
      vin: 'court',
      genre: 'TRR',
      energy: 'XX',
      brand: '',
      model: '',
    },
    TODAY,
  );
  assertEquals(
    [
      tractor.plate,
      tractor.first_registration,
      tractor.vin,
      tractor.category,
      tractor.fuel_type,
      tractor.brand,
    ],
    [null, null, null, 'tractor', null, null],
  );
  assertMatch(registrationReadingPrompt(TODAY), /« numéro de série »/);
});
