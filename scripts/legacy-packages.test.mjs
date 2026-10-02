import { describe, expect, it } from 'vitest';
import {
  convertPackage,
  legacyPackages,
  packagesSql,
  parseHours,
  parsePrice,
  sqlText,
} from './legacy-packages.mjs';

const legacy = {
  id: 'f1',
  nom: ' Forfait disques et plaquettes arrière PL ',
  categorie: 'pl',
  temps: '3h30',
  prix: '340,50 €',
  detail: 'Dépose des roues arrière\nRemplacement des disques',
  motscles: 'disque arriere, plaquette arriere, ',
  champs: ['disques_arriere', 'plaquettes_arriere', 'pneus_avant'],
};

describe('reprise des forfaits de l’ancienne appli', () => {
  it('temps barème et prix lus comme dans l’ancienne appli', () => {
    expect(['3h', '1h30', '1.5', '2,5 h', '45min', '12h+', ''].map(parseHours)).toEqual([
      3,
      1.5,
      1.5,
      2.5,
      0.75,
      12,
      null,
    ]);
    expect(parseHours('trois heures')).toBeNull();
    expect(['340', '340,50 €', '1 200', '', 'gratuit'].map(parsePrice)).toEqual([
      340,
      340.5,
      1200,
      null,
      null,
    ]);
  });

  it('forfait converti : catégorie, mots-clés par groupe, cases connues seulement', () => {
    const { row, warnings, error } = convertPackage(legacy);
    expect(error).toBeUndefined();
    expect(row).toEqual({
      legacy_id: 'forfait:f1',
      name: 'Forfait disques et plaquettes arrière PL',
      category: 'pl',
      standard_hours: 3.5,
      price: 340.5,
      details: 'Dépose des roues arrière\nRemplacement des disques',
      keywords: ['disque arriere', 'plaquette arriere'],
      trigger_fields: ['disques_arriere', 'plaquettes_arriere'],
    });
    expect(warnings).toEqual([
      '« Forfait disques et plaquettes arrière PL » : cases inconnues ignorées (pneus_avant)',
    ]);
  });

  it('« toutes catégories », prix vide ; forfait sans nom ou sans temps ignoré', () => {
    expect(
      convertPackage({ id: 'f2', nom: 'Vidange', categorie: 'toutes', temps: '1h', prix: '' }).row,
    ).toMatchObject({
      category: null,
      price: null,
      keywords: [],
      trigger_fields: [],
    });
    expect(convertPackage({ id: 'f3', nom: '', temps: '1h' }).error).toBe(
      'forfait sans identifiant ou sans nom',
    );
    expect(convertPackage({ id: 'f4', nom: 'Géométrie', temps: '' }).error).toMatch(/temps barème illisible/);
  });

  it('sauvegarde : liste des forfaits dans config.forfaits', () => {
    expect(legacyPackages({ config: { forfaits: { list: [legacy] } } })).toHaveLength(1);
    expect(() => legacyPackages({ config: {} })).toThrow(/config\.forfaits\.list introuvable/);
  });

  it('script SQL rejouable : texte échappé, rattachement par nom, mise à jour par identifiant', () => {
    expect(sqlText("Contrôle d'éclairage")).toBe("'Contrôle d''éclairage'");
    expect(sqlText('Ligne 1\nLigne 2')).toBe("E'Ligne 1\\nLigne 2'");
    const { row } = convertPackage(legacy);
    const sql = packagesSql([row], { source: 'sauvegarde.json', exportedAt: '2026-10-01T10:00:00Z' });
    expect(sql).toContain('begin;');
    expect(sql).toContain(
      "where legacy_id is null and lower(btrim(name)) = lower('Forfait disques et plaquettes arrière PL')",
    );
    expect(sql).toContain(
      "'pl'::public.labor_category, 3.5, 340.5, E'Dépose des roues arrière\\nRemplacement des disques'",
    );
    expect(sql).toContain("array['disque arriere', 'plaquette arriere']::text[]");
    expect(sql).toContain('on conflict (legacy_id) do update set');
    expect(sql).not.toContain('is_active = true');
    expect(sql.trim().endsWith('commit;')).toBe(true);
  });
});
