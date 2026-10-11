import { describe, expect, it } from 'vitest';
import { formatSiret, isValidSiret, siretField, siretValue } from './siret';

describe('SIRET', () => {
  it('14 chiffres et clé de Luhn, espaces acceptés', () => {
    expect(isValidSiret('984 989 137 00018')).toBe(true);
    expect(isValidSiret('98498913700019')).toBe(false);
    expect(isValidSiret('984 989 137')).toBe(false);
  });

  it('La Poste : somme des chiffres multiple de 5', () => {
    expect(isValidSiret('35600000000056')).toBe(true);
    expect(isValidSiret('35600000000057')).toBe(false);
  });

  it('affiché par blocs, enregistré en chiffres seuls', () => {
    expect(formatSiret('98498913700018')).toBe('984 989 137 00018');
    expect(siretValue(' 984 989 137 00018 ')).toBe('98498913700018');
    expect(siretValue('')).toBeNull();
  });

  it('champ de formulaire : vide accepté, longueur puis clé contrôlées', () => {
    expect(siretField.safeParse('').success).toBe(true);
    expect(siretField.safeParse('984 989 137').error?.issues[0]?.message).toBe('SIRET à 14 chiffres');
    expect(siretField.safeParse('98498913700019').error?.issues[0]?.message).toBe(
      'SIRET invalide : vérifie les chiffres',
    );
  });
});
