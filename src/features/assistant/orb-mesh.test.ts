import { describe, expect, it } from 'vitest';
import { orbMesh, orbTarget } from './orb-mesh';
import { sourcesLabel } from './suggestions';

const shape = { amp: 1, phase: 0.4, tilt: 24, turn: -16, radius: 90, center: 140 };

describe('orbe vocale', () => {
  it('maillage rangé par profondeur, dans le cadre de l’orbe', () => {
    const bins = orbMesh(shape);
    expect(bins).toHaveLength(3);
    for (const lines of bins) expect(lines.length).toBeGreaterThan(10);
    const points = bins.flat(2);
    for (const [x, y] of points) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(280);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(280);
    }
  });

  it('la forme bouge quand la phase avance', () => {
    const first = orbMesh(shape)[2]?.[0]?.[0];
    const later = orbMesh({ ...shape, phase: 1.4 })[2]?.[0]?.[0];
    expect(first).not.toEqual(later);
  });

  it('chaque état a sa forme : plus grande et plus agitée en parlant qu’au repos', () => {
    expect(orbTarget('speaking', 0.3).radius).toBeGreaterThan(orbTarget('idle', 0.3).radius);
    expect(orbTarget('listening', 0).speed).toBeGreaterThan(orbTarget('idle', 0).speed);
  });

  it('sources lisibles', () => {
    expect(sourcesLabel(['chiffres_du_mois', 'charge_atelier'])).toBe(
      'Sources : chiffres du mois, charge atelier',
    );
    expect(sourcesLabel([])).toBe('');
  });
});
