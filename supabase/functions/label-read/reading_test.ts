import { assertEquals, assertMatch } from '@std/assert';
import { inspectionReadingPrompt, validPlate, validVin } from './inspection-reading.ts';
import { addMonthsToMonth, nextDueMonth, tailgateReadingPrompt, validDate, validMonth } from './reading.ts';
import { checkedLicense, licenseReadingPrompt } from './license-reading.ts';
import { checkedRegistration, registrationReadingPrompt } from './registration-reading.ts';

const TODAY = '2026-10-02';
const reading = (due: string, last: string) => ({
  due_month: due,
  last_control_month: last,
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

Deno.test('hayon : mois MMAAAA réel et plausible, sinon rien', () => {
  assertEquals(validMonth('052025', TODAY), '052025');
  assertEquals(validMonth(' 122026 ', TODAY), '122026');
  assertEquals(validMonth('132025', TODAY), null);
  assertEquals(validMonth('002025', TODAY), null);
  assertEquals(validMonth('05/2025', TODAY), null);
  assertEquals(validMonth('051999', TODAY), null);
  assertEquals(validMonth('052045', TODAY), null);
  assertEquals(validMonth('', TODAY), null);
});

Deno.test('hayon : ajout de mois sur un mois MMAAAA', () => {
  assertEquals(addMonthsToMonth('052025', 6), '112025');
  assertEquals(addMonthsToMonth('092025', 6), '032026');
  assertEquals(addMonthsToMonth('122025', 12), '122026');
});

Deno.test('hayon : échéance lue sur l’étiquette, sinon dernier contrôle + 6 mois', () => {
  assertEquals(nextDueMonth(reading('052025', '112024'), TODAY), '052025');
  assertEquals(nextDueMonth(reading('', '112024'), TODAY), '052025');
  assertEquals(nextDueMonth(reading('illisible', ''), TODAY), null);
});

Deno.test('hayon : consigne pour les disques poinçonnés, sortie MMAAAA sans le jour', () => {
  const prompt = tailgateReadingPrompt(TODAY);
  assertEquals(prompt.includes('Nous sommes le 2026-10-02.'), true);
  assertEquals(prompt.includes('MMAAAA'), true);
  assertEquals(prompt.includes('PERCÉE'), true);
  assertEquals(prompt.includes('Prochain contrôle le'), true);
  assertEquals(prompt.includes('Date de fin'), true);
  assertEquals(prompt.includes('ignore le jour'), true);
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
