import { describe, expect, it } from 'vitest';
import { countAlerts, inspectionMissingPoints, trailerAxles, usesTrailerAxles } from './inspection';

const CHECKS_OK = {
  etiquettes: 'OK',
  hayon: 'OK',
  extincteur1: 'OK',
  extincteur2: 'OK',
  extincteur6: 'OK',
  eclairage: 'OK',
};

describe('remorque : fiche de contrôle par essieu', () => {
  it('3 essieux au départ ; ancienne fiche reprise (avant = essieu 1, arrière = essieu 2)', () => {
    expect(trailerAxles(null)).toEqual([{}, {}, {}]);
    expect(
      trailerAxles({
        usure: { disques_avant: 'HS', plaquettes_arriere: 'OK' },
        pneus: { arriere_etat: '50', arriere_taille: '385/65 R22.5' },
      }),
    ).toEqual([{ disques: 'HS' }, { plaquettes: 'OK', pneus_etat: '50', pneus_taille: '385/65 R22.5' }, {}]);
    expect(usesTrailerAxles({ usure: { disques_avant: 'HS' } })).toBe(false);
    expect(usesTrailerAxles({ remorque_essieux: [] })).toBe(true);
  });

  it('fiche complète : essieux remplis seulement (un essieu vide n’existe pas), au moins le premier', () => {
    expect(inspectionMissingPoints({ controles: CHECKS_OK }, 'remorque')).toBe(3);
    expect(
      inspectionMissingPoints(
        {
          controles: CHECKS_OK,
          remorque_essieux: [{ disques: 'OK', plaquettes: 'OK', pneus_etat: 'OK' }, {}, {}],
        },
        'remorque',
      ),
    ).toBe(0);
    expect(
      inspectionMissingPoints(
        {
          controles: CHECKS_OK,
          remorque_essieux: [{ disques: 'OK', plaquettes: 'OK', pneus_etat: 'OK' }, { pneus_etat: 'HS' }, {}],
        },
        'remorque',
      ),
    ).toBe(2);
  });

  it('alertes : freins et pneus des essieux, plus ceux de l’ancienne fiche', () => {
    expect(
      countAlerts({
        usure: { disques_avant: 'HS' },
        remorque_essieux: [{ disques: 'OK', plaquettes: '50' }, { pneus_etat: 'HS' }],
      }),
    ).toBe(2);
  });
});
