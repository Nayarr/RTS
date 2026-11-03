import type { FleetCategory } from './fleet-api';

/**
 * Certificat de cession (cerfa 15776*02, formulaire officiel sans champs à remplir) : valeurs écrites
 * à leur place sur les deux exemplaires. Restent à la main : certificat d'immatriculation, attestations
 * et signatures.
 */
export const CERFA_URL = '/documents/cerfa-15776-02.pdf';

export interface CerfaParty {
  name: string;
  isCompany: boolean;
  siret: string | null;
  address: string;
  /** Particulier : case M / F, date (AAAA-MM-JJ) et lieu de naissance. */
  sex?: 'M' | 'F' | null;
  birthDate?: string | null;
  birthPlace?: string | null;
}

export interface CerfaData {
  plate: string;
  vin: string | null;
  firstRegistration: string | null;
  brand: string;
  model: string;
  category: FleetCategory;
  mileage: number | null;
  /** Date et heure de la vente, à l'heure de Paris. */
  soldAt: Date;
  seller: CerfaParty;
  sellerCity: string;
  buyer: CerfaParty;
}

export interface CerfaAddress {
  number: string;
  extension: string;
  wayType: string;
  wayName: string;
  postalCode: string;
  city: string;
}

const WAY_TYPES =
  'rue|avenue|av\\.?|boulevard|bd|place|chemin|route|rte|all[ée]e|impasse|quai|cours|square|zac|za|zi|voie|sentier|passage|rond-point|r[ée]sidence|lotissement';

/** « 19 rue Gaston Monmousseau, 95190 Goussainville » → champs du formulaire. Inconnu : dans le nom de voie. */
export function parseAddress(address: string): CerfaAddress {
  const text = address
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^france$/i.test(line))
    .join(', ');
  const city = /(?:^|[\s,])(\d{5})\s+([^,]+)/.exec(text);
  const street = (city ? text.slice(0, city.index) : text).replace(/[\s,]+$/, '').trim();
  const parts = new RegExp(`^(\\d+)\\s*(bis|ter|quater)?\\s+(?:(${WAY_TYPES})\\s+)?(.*)$`, 'i').exec(street);
  return {
    number: parts?.[1] ?? '',
    extension: parts?.[2] ?? '',
    wayType: parts?.[3] ?? '',
    wayName: parts ? (parts[4] ?? '') : street,
    postalCode: city?.[1] ?? '',
    city: (city?.[2] ?? '').trim(),
  };
}

/** Genre national (J.1) ; remorque ou semi-remorque : à reporter de la carte grise. */
const GENRE: Partial<Record<FleetCategory, string>> = { tractor: 'TRR', van: 'CTTE', car: 'VP' };

const PARIS = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Paris',
});

/** Date et heure de Paris, découpées pour les cases du formulaire. */
export function parisParts(date: Date) {
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    PARIS.formatToParts(date).find((part) => part.type === type)?.value ?? '';
  return {
    day: get('day'),
    month: get('month'),
    year: get('year'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

// Positions relevées sur le formulaire, en points depuis le haut de la page (A4)
const PAGE_H = 841.89;
interface Span {
  from: number;
  to: number;
  count: number;
}
const cellsOf = (from: number, to: number, count: number): Span => ({ from, to, count });
const PLATE = cellsOf(35.6, 163.8, 9);
const VIN = cellsOf(173.8, 415, 17);
const DATE_FIRST = [cellsOf(440.8, 464, 2), cellsOf(466.5, 489.5, 2), cellsOf(492, 537.5, 4)] as const;
const SIRET = cellsOf(395, 554.5, 14);
const POSTAL = cellsOf(107.5, 178.8, 5);
const SALE_DATE = [cellsOf(47, 70, 2), cellsOf(72.5, 95.6, 2), cellsOf(98, 144.4, 4)] as const;
const SALE_HOUR = cellsOf(153, 176.3, 2);
const SALE_MINUTE = cellsOf(187, 210, 2);
const BIRTH_DATE = [cellsOf(71.3, 93.8, 2), cellsOf(96.3, 119.4, 2), cellsOf(122, 168, 4)] as const;

export interface CerfaText {
  text: string;
  x: number;
  y: number;
}
export interface CerfaMark {
  x: number;
  y: number;
}

/** Texte réparti case par case (centré dans chaque case). */
function inCells(span: Span, value: string, y: number): CerfaText[] {
  const width = (span.to - span.from) / span.count;
  return [...value.slice(0, span.count)].map((text, index) => ({
    text,
    x: span.from + width * index + width / 2 - 2.6,
    y,
  }));
}

const isoCells = (spans: readonly [Span, Span, Span], iso: string, y: number) => [
  ...inCells(spans[0], iso.slice(8, 10), y),
  ...inCells(spans[1], iso.slice(5, 7), y),
  ...inCells(spans[2], iso.slice(0, 4), y),
];

const compactRef = (value: string) => value.toUpperCase().replace(/\s/g, '');

/** Tout ce qu'on écrit sur un exemplaire : textes et cases cochées. */
export function cerfaContent(data: CerfaData): { texts: CerfaText[]; marks: CerfaMark[] } {
  const seller = parseAddress(data.seller.address);
  const buyer = parseAddress(data.buyer.address);
  const sale = parisParts(data.soldAt);
  const line = (text: string, x: number, y: number): CerfaText[] => (text ? [{ text, x, y }] : []);
  const address = (where: CerfaAddress, y: number, yCity: number) => [
    ...line(where.number, 110, y),
    ...line(where.extension, 158, y),
    ...line(where.wayType, 207, y),
    ...line(where.wayName, 284, y),
    ...inCells(POSTAL, where.postalCode, yCity),
    ...line(where.city, 193, yCity),
  ];
  const texts: CerfaText[] = [
    ...inCells(PLATE, compactRef(data.plate), 120),
    ...inCells(VIN, compactRef(data.vin ?? ''), 120),
    ...(data.firstRegistration ? isoCells(DATE_FIRST, data.firstRegistration, 120) : []),
    ...line(data.brand, 38, 143.5),
    ...line(GENRE[data.category] ?? '', 324, 143.5),
    ...line(data.model, 444, 143.5),
    ...line(data.mileage === null ? '' : String(data.mileage), 210, 168),
    // Ancien propriétaire
    ...line(data.seller.name, 93, 296.5),
    ...inCells(SIRET, (data.seller.siret ?? '').replace(/\s/g, ''), 296.5),
    ...address(seller, 328, 347),
    ...isoCells(SALE_DATE, `${sale.year}-${sale.month}-${sale.day}`, 391.5),
    ...inCells(SALE_HOUR, sale.hour, 391.5),
    ...inCells(SALE_MINUTE, sale.minute, 391.5),
    ...line(data.sellerCity, 67, 510),
    ...line(`${sale.day}/${sale.month}/${sale.year}`, 195, 510),
    // Nouveau propriétaire
    ...line(data.buyer.name, 93, 628.5),
    ...inCells(SIRET, (data.buyer.siret ?? '').replace(/\s/g, ''), 628.5),
    ...(data.buyer.birthDate ? isoCells(BIRTH_DATE, data.buyer.birthDate, 651.5) : []),
    ...line(data.buyer.birthPlace ?? '', 185, 651.5),
    ...address(buyer, 672, 691.5),
  ];
  const marks: CerfaMark[] = [
    // Personne morale (RTS), céder
    { x: 39.4, y: 276 },
    { x: 188.6, y: 372.6 },
    // Acheteur : personne morale ou physique, sexe
    data.buyer.isCompany ? { x: 39.4, y: 608 } : { x: 39.4, y: 598 },
  ];
  if (data.buyer.sex === 'M') marks.push({ x: 283.1, y: 598 });
  if (data.buyer.sex === 'F') marks.push({ x: 306.9, y: 598 });
  return { texts, marks };
}

/** Écrit les valeurs sur les deux exemplaires du formulaire. */
export async function fillCerfa(template: ArrayBuffer | Uint8Array, data: CerfaData) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.load(template);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { texts, marks } = cerfaContent(data);
  const ink = rgb(0.05, 0.05, 0.05);
  for (const page of doc.getPages()) {
    for (const { text, x, y } of texts) {
      page.drawText(printable(text), { x, y: PAGE_H - y, size: 9, font, color: ink });
    }
    for (const { x, y } of marks) {
      page.drawText('X', { x: x - 3, y: PAGE_H - y - 3.2, size: 9.5, font: bold, color: ink });
    }
  }
  return doc.save();
}

/** Caractères que la police du PDF sait écrire (espaces insécables, apostrophes courbes…). */
const printable = (value: string) =>
  value
    .replace(/\s/g, ' ')
    .replace(/[’‘]/g, "'")
    .replace(/[^\x20-\x7e\xa0-\xff]/g, '');
