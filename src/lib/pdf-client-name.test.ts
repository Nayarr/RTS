import { describe, expect, it } from 'vitest';
import { createPdf } from '@/lib/pdf';
import { clientNameLines, drawClientBox } from '@/lib/pdf-document';

const LONG = 'SOCIÉTÉ DE TRANSPORTS ET DE LOGISTIQUE FRIGORIFIQUE DU VAL D’OISE ET DE L’ÎLE-DE-FRANCE';
const VERY_LONG =
  'SOCIÉTÉ NOUVELLE DES TRANSPORTS ROUTIERS ET DE LA LOGISTIQUE FRIGORIFIQUE INTERNATIONALE ' +
  'DU VAL D’OISE, DE L’OISE ET DE L’ÎLE-DE-FRANCE (SNTRLFI) SAS';
const WIDTH = 80;

async function boldDoc() {
  const { doc } = await createPdf();
  doc.setFont('helvetica', 'bold');
  return doc;
}

describe('nom du client dans son cadre', () => {
  it('nom court : une ligne en 10,5 pt', async () => {
    const name = clientNameLines(await boldDoc(), 'Transports Martin', WIDTH);
    expect(name).toMatchObject({ size: 10.5, lines: ['Transports Martin'] });
  });

  it('nom long : police réduite, chaque ligne dans la largeur du cadre', async () => {
    const doc = await boldDoc();
    for (const text of [LONG, VERY_LONG]) {
      const name = clientNameLines(doc, text, WIDTH);
      expect(name.size).toBeLessThan(10.5);
      doc.setFontSize(name.size);
      for (const line of name.lines) expect(doc.getTextWidth(line)).toBeLessThanOrEqual(WIDTH + 0.01);
      // Rien de perdu : tout le nom est imprimé
      expect(name.lines.join(' ').replace(/\s+/g, ' ')).not.toContain('...');
    }
  });

  it('nom démesuré : coupé par « ... » après cinq lignes', async () => {
    const name = clientNameLines(await boldDoc(), VERY_LONG.repeat(3), WIDTH);
    expect(name.lines).toHaveLength(5);
    expect(name.lines.at(-1)).toMatch(/\.\.\.$/);
  });

  it('le cadre grandit avec le nom : l’adresse n’est plus recouverte', async () => {
    const { doc } = await createPdf();
    const client = {
      name: 'Transports Martin',
      billing_address: '12 avenue des Transporteurs\n95190 Goussainville',
    };
    const short = drawClientBox(doc, 'Facturé à', client);
    const long = drawClientBox(doc, 'Facturé à', { ...client, name: LONG });
    expect(long).toBeGreaterThan(short);
  });
});
