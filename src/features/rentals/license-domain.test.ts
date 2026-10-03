import { describe, expect, it } from 'vitest';
import type { LicenseReading } from './license-api';
import {
  applyReading,
  emptyLicense,
  licenseBlockReason,
  licenseCovers,
  licenseFromForm,
  licenseSchema,
  licenseState,
  properName,
} from './license-domain';

const scanned = {
  recto_file_id: 'r',
  verso_file_id: 'v',
  license_number: '910395200123',
  categories: ['B', 'BE'],
  valid_until: '2033-06-22',
};

const reading: LicenseReading = {
  last_name: 'MARTIN',
  first_name: 'Julie',
  birth_date: '1991-03-14',
  birth_place: 'Pontoise',
  license_number: '910395200123',
  issued_on: '2010-06-22',
  valid_until: '2033-06-22',
  categories: ['B', 'BE'],
  confidence: 'haute',
};

describe('permis : utilisable pour louer', () => {
  it('scanné recto et verso, catégorie couverte, valide pendant la location', () => {
    expect(licenseBlockReason(scanned, 'B', '2026-10-10')).toBeNull();
    expect(licenseBlockReason({ ...scanned, verso_file_id: null }, 'B', '2026-10-10')).toBe(
      'Permis à scanner (recto et verso)',
    );
    expect(licenseBlockReason({ ...scanned, license_number: null }, 'B', '2026-10-10')).toBe(
      'Numéro de permis manquant',
    );
    expect(licenseBlockReason(scanned, 'CE', '2026-10-10')).toBe('Permis CE requis');
    expect(licenseBlockReason(scanned, 'B', '2033-07-01')).toBe('Permis expiré le 22/06/2033');
  });

  it('catégories supérieures (mêmes règles que la base)', () => {
    expect(licenseCovers(['B', 'C'], 'C1')).toBe(true);
    expect(licenseCovers(['B', 'C', 'CE'], 'BE')).toBe(true);
    expect(licenseCovers(['B', 'C1', 'C1E'], 'BE')).toBe(true);
    expect(licenseCovers(['B'], 'BE')).toBe(false);
    expect(licenseCovers(['B', 'C'], 'CE')).toBe(false);
  });

  it('badge de la fiche : à scanner, expiré ou valide', () => {
    expect(licenseState({ ...scanned, recto_file_id: null }, '2026-10-03').label).toBe('À scanner');
    expect(licenseState(scanned, '2034-01-01').label).toBe('Expiré');
    expect(licenseState({ ...scanned, valid_until: null }, '2034-01-01').label).toBe('Valide');
  });
});

describe('permis : lecture du scan et saisie', () => {
  it('les champs lus remplacent la saisie, ceux non lus la gardent', () => {
    const values = { ...emptyLicense({ first_name: 'Julie', last_name: 'Martin' }), birth_place: 'Cergy' };
    const filled = applyReading(values, { ...reading, birth_place: '', categories: ['B', 'XX'] });
    expect(filled).toMatchObject({
      last_name: 'MARTIN',
      birth_date: '1991-03-14',
      birth_place: 'Cergy',
      categories: ['B'],
      read_automatically: true,
    });
  });

  it('numéro nettoyé, catégories dans l’ordre du permis', () => {
    const values = licenseSchema.parse({
      ...emptyLicense({ first_name: 'Julie', last_name: 'MARTIN' }),
      license_number: '9103 9520-0123',
      categories: ['CE', 'B', 'C'],
      valid_until: '2033-06-22',
      issued_on: '2010-06-22',
    });
    expect(licenseFromForm(values, 'c1')).toMatchObject({
      client_id: 'c1',
      license_number: '910395200123',
      categories: ['B', 'C', 'CE'],
      birth_date: null,
    });
  });

  it('dates incohérentes et numéro invalide refusés', () => {
    const base = emptyLicense({ first_name: 'Julie', last_name: 'Martin' });
    const paths = (values: Partial<typeof base>) =>
      licenseSchema.safeParse({ ...base, ...values }).error?.issues.map((issue) => issue.path[0]);
    expect(paths({ license_number: '12' })).toEqual(['license_number']);
    expect(paths({ issued_on: '2020-01-01', valid_until: '2019-01-01' })).toEqual(['valid_until']);
  });

  it('nom lu en majuscules remis en forme pour la fiche client', () => {
    expect(properName('MARTIN-LEROY')).toBe('Martin-Leroy');
    expect(properName(' JEAN PIERRE ')).toBe('Jean Pierre');
    expect(properName("D'ARTAGNAN")).toBe("D'Artagnan");
  });
});
