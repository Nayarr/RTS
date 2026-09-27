import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

describe('export CSV', () => {
  it('lisible par Excel en français : « ; », virgule décimale, guillemets, BOM', () => {
    const csv = toCsv(
      ['Client', 'Total'],
      [
        ['Dupont; fils', 1234.5],
        ['Le "Garage"', null],
      ],
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe('Client;Total\r\n"Dupont; fils";1234,50\r\n"Le ""Garage""";\r\n');
  });
});
