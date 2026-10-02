import { assertEquals } from '@std/assert';
import { addMonths, nextDueDate, readingPrompt, validDate } from './reading.ts';

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
