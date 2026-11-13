/**
 * Marque d'un véhicule tirée de son VIN : les 3 premiers caractères (WMI, code constructeur mondial)
 * désignent le constructeur. Table locale (pas d'appel extérieur) limitée aux poids lourds,
 * utilitaires et remorques courants en France. Le modèle ne se déduit pas du VIN d'un camion
 * européen : il vient de la lecture du contrôle technique ou de la carte grise.
 * Même table en base : public.vin_brand (migration vin_marque_modele), à garder identique.
 */
export const VIN_BRANDS: Record<string, string> = {
  // Poids lourds
  VF6: 'Renault Trucks',
  WDB: 'Mercedes-Benz',
  W1T: 'Mercedes-Benz',
  WMA: 'MAN',
  YS2: 'Scania',
  XLE: 'Scania',
  YV2: 'Volvo',
  XLR: 'DAF',
  ZCF: 'Iveco',
  JAL: 'Isuzu',
  // Utilitaires
  VF1: 'Renault',
  VF3: 'Peugeot',
  VF7: 'Citroën',
  WDF: 'Mercedes-Benz',
  W1V: 'Mercedes-Benz',
  WF0: 'Ford',
  NM0: 'Ford',
  ZFA: 'Fiat',
  WV1: 'Volkswagen',
  WV2: 'Volkswagen',
  W0V: 'Opel',
  // Remorques et semi-remorques
  WSM: 'Schmitz Cargobull',
  WKE: 'Krone',
};

/** VIN valide : 17 caractères sans I, O ni Q (ISO 3779), espaces et tirets ignorés. */
export function normalizeVinText(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

/** Marque connue pour ce VIN (dès ses 3 premiers caractères), sinon null. */
export function vinBrand(vin: string | null | undefined): string | null {
  const wmi = normalizeVinText(vin ?? '').slice(0, 3);
  return wmi.length === 3 ? (VIN_BRANDS[wmi] ?? null) : null;
}
