import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { cerfaContent, fillCerfa, parisParts, parseAddress, type CerfaData } from './cerfa-cession';

const data: CerfaData = {
  plate: 'AB-123-CD',
  vin: 'VF620J861GB002211',
  firstRegistration: '2019-03-05',
  brand: 'RENAULT',
  model: 'MASTER',
  category: 'van',
  mileage: 125353,
  soldAt: new Date('2026-11-03T14:30:00Z'),
  seller: {
    name: 'RAPID TRUCK SERVICE',
    isCompany: true,
    siret: '98498913700018',
    address: '19 rue Gaston Monmousseau, 95190 Goussainville',
  },
  sellerCity: 'Goussainville',
  buyer: {
    name: 'SOCIETE MCE',
    isCompany: true,
    siret: null,
    address: '5 RUE MARC SEGUIN\n95190 GOUSSAINVILLE\nFRANCE',
  },
};

describe('adresse du cerfa', () => {
  it('découpe numéro, voie, code postal et commune', () => {
    expect(parseAddress('19 rue Gaston Monmousseau, 95190 Goussainville')).toEqual({
      number: '19',
      extension: '',
      wayType: 'rue',
      wayName: 'Gaston Monmousseau',
      postalCode: '95190',
      city: 'Goussainville',
    });
  });

  it('plusieurs lignes, pays retiré, extension reconnue', () => {
    expect(parseAddress('5 bis AVENUE MARC SEGUIN\n95190 GOUSSAINVILLE\nFRANCE')).toEqual({
      number: '5',
      extension: 'bis',
      wayType: 'AVENUE',
      wayName: 'MARC SEGUIN',
      postalCode: '95190',
      city: 'GOUSSAINVILLE',
    });
  });

  it('adresse non reconnue : gardée entière dans le nom de voie', () => {
    expect(parseAddress('Zone des Tulipes')).toMatchObject({ number: '', wayName: 'Zone des Tulipes' });
  });
});

describe('contenu du cerfa', () => {
  const written = (content: ReturnType<typeof cerfaContent>) =>
    content.texts.map((item) => item.text).join('');

  it('heure de Paris, pas celle du navigateur', () => {
    expect(parisParts(new Date('2026-11-03T14:30:00Z'))).toEqual({
      day: '03',
      month: '11',
      year: '2026',
      hour: '15',
      minute: '30',
    });
  });

  it('véhicule, RTS et acheteur repris', () => {
    const text = written(cerfaContent(data));
    for (const value of ['AB-123-CD', 'VF620J861GB002211', 'RENAULT', 'MASTER', 'CTTE', '125353']) {
      expect(text).toContain(value);
    }
    expect(text).toContain('RAPID TRUCK SERVICE');
    expect(text).toContain('98498913700018');
    expect(text).toContain('SOCIETE MCE');
    expect(text).toContain('Goussainville');
  });

  it('remorque : genre laissé à reporter de la carte grise', () => {
    expect(written(cerfaContent({ ...data, category: 'trailer' }))).not.toContain('CTTE');
  });

  it('particulier : sexe et naissance', () => {
    const { texts, marks } = cerfaContent({
      ...data,
      buyer: { ...data.buyer, isCompany: false, sex: 'F', birthDate: '1980-04-12', birthPlace: 'Pontoise' },
    });
    expect(texts.map((item) => item.text).join('')).toContain('12041980');
    expect(texts.map((item) => item.text)).toContain('Pontoise');
    expect(marks).toContainEqual({ x: 306.9, y: 598 });
  });
});

describe('formulaire officiel', () => {
  it('reste de 2 pages une fois rempli', async () => {
    const template = readFileSync(resolve(process.cwd(), 'public/documents/cerfa-15776-02.pdf'));
    const filled = await fillCerfa(new Uint8Array(template), {
      ...data,
      buyer: { ...data.buyer, name: 'Société Générale d’Occasion' },
    });
    const doc = await PDFDocument.load(filled);
    expect(doc.getPageCount()).toBe(2);
  });
});
