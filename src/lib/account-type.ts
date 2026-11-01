/**
 * Type de compte du client : il donne l'échéance de ses factures (calculée par la base à l'émission).
 * Un seul choix dans les formulaires, enregistré en type de compte + jour de prélèvement.
 */
export const ACCOUNT_CHOICES = {
  comptant: 'Comptant',
  prelevement_5: 'Prélèvement le 5',
  prelevement_15: 'Prélèvement le 15',
  quinzaine: 'Règlement à quinzaine (le 15 et le 1er)',
  // Anciennes fiches en prélèvement sans jour : délai de paiement des réglages
  prelevement: 'Prélèvement (jour à préciser)',
} as const;

export type AccountChoice = keyof typeof ACCOUNT_CHOICES;
export const ACCOUNT_CHOICE_VALUES = Object.keys(ACCOUNT_CHOICES) as [AccountChoice, ...AccountChoice[]];

interface AccountFields {
  account_type: string | null;
  direct_debit_day: number | null;
}

export function accountChoice({ account_type, direct_debit_day }: AccountFields): AccountChoice {
  if (account_type === 'quinzaine') return 'quinzaine';
  if (account_type !== 'prelevement') return 'comptant';
  return direct_debit_day === 5
    ? 'prelevement_5'
    : direct_debit_day === 15
      ? 'prelevement_15'
      : 'prelevement';
}

export function accountFromChoice(choice: AccountChoice): {
  account_type: string;
  direct_debit_day: number | null;
} {
  switch (choice) {
    case 'prelevement_5':
      return { account_type: 'prelevement', direct_debit_day: 5 };
    case 'prelevement_15':
      return { account_type: 'prelevement', direct_debit_day: 15 };
    case 'prelevement':
    case 'quinzaine':
      return { account_type: choice, direct_debit_day: null };
    default:
      return { account_type: 'comptant', direct_debit_day: null };
  }
}

/** Choix proposés : le prélèvement sans jour seulement pour une fiche qui l'a encore. */
export const accountOptions = (current: AccountChoice) =>
  (Object.entries(ACCOUNT_CHOICES) as [AccountChoice, string][]).filter(
    ([value]) => value !== 'prelevement' || current === 'prelevement',
  );
