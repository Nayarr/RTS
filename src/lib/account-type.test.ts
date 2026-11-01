import { describe, expect, it } from 'vitest';
import { accountChoice, accountFromChoice, accountOptions } from './account-type';

describe('type de compte du client', () => {
  it('lu depuis la fiche : prélèvement avec son jour, quinzaine, comptant par défaut', () => {
    expect(accountChoice({ account_type: 'prelevement', direct_debit_day: 15 })).toBe('prelevement_15');
    expect(accountChoice({ account_type: 'prelevement', direct_debit_day: null })).toBe('prelevement');
    expect(accountChoice({ account_type: 'quinzaine', direct_debit_day: null })).toBe('quinzaine');
    expect(accountChoice({ account_type: null, direct_debit_day: null })).toBe('comptant');
  });

  it('enregistré en type de compte et jour de prélèvement', () => {
    expect(accountFromChoice('prelevement_5')).toEqual({ account_type: 'prelevement', direct_debit_day: 5 });
    expect(accountFromChoice('quinzaine')).toEqual({ account_type: 'quinzaine', direct_debit_day: null });
    expect(accountFromChoice('comptant')).toEqual({ account_type: 'comptant', direct_debit_day: null });
  });

  it('prélèvement sans jour proposé seulement à une fiche qui l’a encore', () => {
    expect(accountOptions('comptant').map(([value]) => value)).toEqual([
      'comptant',
      'prelevement_5',
      'prelevement_15',
      'quinzaine',
    ]);
    expect(accountOptions('prelevement').map(([value]) => value)).toContain('prelevement');
  });
});
