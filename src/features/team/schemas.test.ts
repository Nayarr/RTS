import { describe, expect, it } from 'vitest';
import {
  createAccountSchema,
  editAccountSchema,
  pinSchema,
  toCreateAccountInput,
  type CreateAccountValues,
} from './schemas';

const base: CreateAccountValues = {
  email: 'Karim@RTS.fr',
  full_name: '  Karim Benali ',
  role: 'technician',
  is_technician: true,
  display_name: 'Karim',
  color: '#8B3A9E',
  access: 'invite',
  password: '',
};

const messages = (result: { error?: { issues: { message: string }[] } }) =>
  result.error?.issues.map((issue) => issue.message) ?? [];

describe('createAccountSchema', () => {
  it('accepte une invitation sans mot de passe', () => {
    expect(createAccountSchema.safeParse(base).success).toBe(true);
  });

  it('exige le nom au planning pour une fiche technicien', () => {
    expect(messages(createAccountSchema.safeParse({ ...base, display_name: '' }))).toContain(
      'Indique le nom affiché au planning',
    );
  });

  it('ignore le nom au planning sans fiche technicien', () => {
    const result = createAccountSchema.safeParse({
      ...base,
      role: 'reception',
      is_technician: false,
      display_name: '',
    });
    expect(result.success).toBe(true);
  });

  it('exige un mot de passe provisoire solide', () => {
    expect(
      messages(createAccountSchema.safeParse({ ...base, access: 'password', password: 'court1' })),
    ).toContain('Au moins 10 caractères');
    expect(
      messages(createAccountSchema.safeParse({ ...base, access: 'password', password: 'sanschiffres' })),
    ).toContain('Au moins une lettre et un chiffre');
    expect(
      createAccountSchema.safeParse({ ...base, access: 'password', password: 'Atelier-2026' }).success,
    ).toBe(true);
  });
});

describe('toCreateAccountInput', () => {
  it('invitation : pas de mot de passe envoyé, e-mail normalisé', () => {
    expect(toCreateAccountInput(base)).toEqual({
      email: 'karim@rts.fr',
      full_name: 'Karim Benali',
      role: 'technician',
      technician: { display_name: 'Karim', color: '#8B3A9E' },
    });
  });

  it('mot de passe provisoire et compte sans fiche technicien', () => {
    expect(
      toCreateAccountInput({
        ...base,
        role: 'reception',
        is_technician: false,
        access: 'password',
        password: 'Atelier-2026',
      }),
    ).toMatchObject({ role: 'reception', technician: null, password: 'Atelier-2026' });
  });
});

describe('editAccountSchema', () => {
  it('valide une fiche technicien avec groupe de repos', () => {
    const result = editAccountSchema.safeParse({
      full_name: 'Bruno Petit',
      role: 'technician',
      is_technician: true,
      display_name: 'Bruno',
      color: null,
      exclude_from_planning: false,
      rest_group: 'B',
    });
    expect(result.success).toBe(true);
  });
});

describe('pinSchema', () => {
  it('4 à 6 chiffres, confirmés', () => {
    expect(pinSchema.safeParse({ pin: '2468', confirmation: '2468' }).success).toBe(true);
    expect(messages(pinSchema.safeParse({ pin: '12', confirmation: '12' }))).toContain('De 4 à 6 chiffres');
    expect(messages(pinSchema.safeParse({ pin: '12ab', confirmation: '12ab' }))).toContain(
      'De 4 à 6 chiffres',
    );
    expect(messages(pinSchema.safeParse({ pin: '2468', confirmation: '1357' }))).toContain(
      'Les deux codes ne correspondent pas',
    );
  });
});
