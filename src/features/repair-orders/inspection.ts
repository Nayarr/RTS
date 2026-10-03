/**
 * Fiche de contrôle véhicule (table inspections, colonne data en JSON).
 * Mêmes clés que l'ancienne appli : la base s'en sert pour ajouter automatiquement
 * les forfaits et lignes « Remplacement … » à prévoir (sync_inspection_work).
 */

export interface ChipOption {
  value: string;
  label: string;
  color: string;
}

export const WEAR_OPTIONS: ChipOption[] = [
  { value: 'OK', label: 'OK', color: '#2A6B52' },
  { value: '50', label: '50%', color: '#C98A00' },
  { value: 'HS', label: 'HS', color: '#B23A32' },
];

export const OK_HS_OPTIONS: ChipOption[] = [
  { value: 'OK', label: 'OK', color: '#2A6B52' },
  { value: 'HS', label: 'HS', color: '#B23A32' },
];

export const YES_NO_OPTIONS: ChipOption[] = [
  { value: 'OUI', label: 'OUI', color: '#B23A32' },
  { value: 'NON', label: 'NON', color: '#2A6B52' },
];

export const WEAR_FIELDS = [
  ['plaquettes_avant', 'Plaquettes avant'],
  ['plaquettes_arriere', 'Plaquettes arrière'],
  ['disques_avant', 'Disques de frein avant'],
  ['disques_arriere', 'Disques de frein arrière'],
  ['barre_accouplement', 'Barre d’accouplement'],
  ['barre_direction', 'Barre de direction'],
  ['kit_accessoires', 'Kit accessoires'],
] as const;

export const CHECK_FIELDS = [
  ['etiquettes', 'Étiquettes angles morts'],
  ['hayon', 'Étiquette contrôle hayon'],
  ['extincteur1', 'Extincteur 1 kg cabine'],
  ['extincteur2', 'Extincteur 2 kg cabine'],
  ['extincteur6', 'Extincteur 6 kg camion'],
  ['eclairage', 'Éclairage — ampoules'],
] as const;

/** Contrôles pour lesquels le technicien peut photographier l'étiquette. */
export const CHECK_PHOTO_FIELDS = [
  'etiquettes',
  'hayon',
  'extincteur1',
  'extincteur2',
  'extincteur6',
] as const;

export const WARNING_LIGHT_FIELDS = [
  ['moteur', 'Moteur'],
  ['echappement', 'Échappement'],
  ['abs', 'ABS'],
  ['freins', 'Freins'],
] as const;

export const FLUID_FIELDS = [
  ['laveglace', 'Lave-glace'],
  ['refroidissement', 'Liquide de refroidissement'],
  ['huile', 'Huile'],
] as const;

export type WearKey = (typeof WEAR_FIELDS)[number][0];
export type CheckKey = (typeof CHECK_FIELDS)[number][0];
export type WarningLightKey = (typeof WARNING_LIGHT_FIELDS)[number][0];
export type FluidKey = (typeof FLUID_FIELDS)[number][0];

export interface InspectionData {
  usure?: Partial<Record<WearKey, string>>;
  pneus?: { avant_taille?: string; avant_etat?: string; arriere_taille?: string; arriere_etat?: string };
  controles?: Partial<Record<CheckKey, string>>;
  probleme_electrique?: string;
  voyants?: Partial<Record<WarningLightKey, boolean>>;
  voyants_autres?: string;
  niveaux?: Partial<Record<FluidKey, { etat?: string; litres?: string | number }>>;
}

/** Libellé et couleur d'une valeur saisie (« HS » → rouge…). */
export function optionFor(value: string | undefined, options: ChipOption[]) {
  return options.find((option) => option.value === value);
}

/** Nombre de points signalés (HS, 50 %, voyants, problème électrique) : résumé pour le bureau. */
export function countAlerts(data: InspectionData | null | undefined): number {
  if (!data) return 0;
  const values = [
    ...Object.values(data.usure ?? {}),
    data.pneus?.avant_etat,
    data.pneus?.arriere_etat,
    ...Object.values(data.controles ?? {}),
  ];
  return (
    values.filter((value) => value === 'HS' || value === '50').length +
    Object.values(data.voyants ?? {}).filter(Boolean).length +
    (data.probleme_electrique === 'OUI' ? 1 : 0)
  );
}

/**
 * Points OK / 50 % / HS non renseignés (usure, état des pneus, contrôles), comme la base
 * (inspection_missing_points) : exigés quand la direction impose la fiche complète.
 */
export function inspectionMissingPoints(data: InspectionData | null | undefined): number {
  const wear = WEAR_FIELDS.filter(([key]) => !['OK', '50', 'HS'].includes(data?.usure?.[key] ?? '')).length;
  const tyres = (['avant_etat', 'arriere_etat'] as const).filter(
    (key) => !['OK', '50', 'HS'].includes(data?.pneus?.[key] ?? ''),
  ).length;
  const checks = CHECK_FIELDS.filter(([key]) => !['OK', 'HS'].includes(data?.controles?.[key] ?? '')).length;
  return wear + tyres + checks;
}
