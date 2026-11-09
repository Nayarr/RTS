import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createPdf } from '@/lib/pdf';
import { drawTerms, TERMS_FONT_SIZE } from '@/lib/pdf-document';

/** CGV par défaut (migration des conditions générales). */
const defaultTerms = () =>
  readFileSync('supabase/migrations/20270117090000_cgv_factures.sql', 'utf8').split('$terms$')[1] ?? '';

describe('conditions générales en petits caractères', () => {
  it('texte des articles à 6,2 pt, titre à 9 pt au plus', async () => {
    const { doc } = await createPdf();
    const sizes = vi.spyOn(doc, 'setFontSize');
    drawTerms(doc, '1. OBJET\nLes présentes conditions s’appliquent à toutes les réparations.');
    const used = sizes.mock.calls.map(([size]) => size);
    expect(TERMS_FONT_SIZE).toBeLessThan(7);
    expect(used).toContain(TERMS_FONT_SIZE);
    expect(Math.max(...used)).toBeLessThanOrEqual(9);
  });

  it('les CGV par défaut tiennent sur une seule page', async () => {
    const { doc } = await createPdf();
    const before = doc.getNumberOfPages();
    drawTerms(doc, defaultTerms());
    expect(defaultTerms().length).toBeGreaterThan(1000);
    expect(doc.getNumberOfPages()).toBe(before + 1);
  });
});
