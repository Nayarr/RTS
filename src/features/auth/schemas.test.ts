import { describe, expect, it } from 'vitest';
import { loginSchema, newPasswordSchema } from './schemas';

describe('loginSchema', () => {
  it('accepte un e-mail et un mot de passe', () => {
    expect(loginSchema.safeParse({ email: 'tech@rts.fr', password: 'x' }).success).toBe(true);
  });

  it('refuse un e-mail invalide', () => {
    const result = loginSchema.safeParse({ email: 'pas-un-email', password: 'x' });
    expect(result.error?.issues[0]?.message).toBe('Adresse e-mail invalide');
  });

  it('refuse un mot de passe vide', () => {
    const result = loginSchema.safeParse({ email: 'tech@rts.fr', password: '' });
    expect(result.error?.issues[0]?.message).toBe('Renseigne ton mot de passe');
  });
});

describe('newPasswordSchema', () => {
  const check = (password: string, confirmation = password) =>
    newPasswordSchema.safeParse({ password, confirmation }).error?.issues.map((i) => i.message) ?? [];

  it('accepte un mot de passe solide confirmé', () => {
    expect(check('atelier2026')).toEqual([]);
  });

  it('exige 10 caractères, une lettre et un chiffre', () => {
    expect(check('court1')).toContain('Au moins 10 caractères');
    expect(check('sanschiffres')).toContain('Au moins un chiffre');
    expect(check('1234567890')).toContain('Au moins une lettre');
  });

  it('exige une confirmation identique', () => {
    expect(check('atelier2026', 'atelier2027')).toEqual(['Les deux mots de passe ne correspondent pas']);
  });
});
