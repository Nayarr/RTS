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

type VehicleKind = 'pl' | 'vul' | 'remorque';

/** Éléments d'usure sans objet selon le véhicule (comme la base, inspection_wear_fields_for). */
const WEAR_EXCLUDED: Record<VehicleKind, readonly string[]> = {
  pl: [],
  vul: ['barre_accouplement', 'barre_direction'],
  remorque: ['barre_accouplement', 'barre_direction', 'kit_accessoires'],
};

/** Usure contrôlée pour ce type de véhicule (VUL et remorque : pas de barres, remorque : pas de kit). */
export const wearFieldsFor = (vehicleType: VehicleKind | null | undefined) =>
  WEAR_FIELDS.filter(([key]) => !WEAR_EXCLUDED[vehicleType ?? 'pl'].includes(key));

/** Essieux ajoutables (camion à plusieurs essieux, remorque) ; pas sur un utilitaire. */
export const canAddAxles = (vehicleType: VehicleKind | null | undefined) => vehicleType !== 'vul';

export const CHECK_FIELDS = [
  ['etiquettes', 'Étiquettes angles morts'],
  ['hayon', 'Étiquette contrôle hayon'],
  ['extincteur1', 'Extincteur 1 kg cabine'],
  ['extincteur2', 'Extincteur 2 kg cabine'],
  ['extincteur6', 'Extincteur 6 kg camion'],
  ['eclairage', 'Éclairage, ampoules'],
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

/** Essieux de base (2 roues chacun) ; d'autres essieux peuvent être ajoutés (pneus.essieux). */
export const TIRE_AXLES = [
  ['avant', 'Pneus avant'],
  ['arriere', 'Pneus arrière'],
] as const;

/** Essieu « milieu » des anciennes fiches : affiché seulement s'il a été rempli. */
export const LEGACY_MIDDLE_AXLE = ['milieu', 'Pneus milieu'] as const;

/** Essieux de base à afficher : avant et arrière, plus le milieu d'une ancienne fiche remplie. */
export function tireAxlesFor(data: InspectionData | null | undefined) {
  const middle = data?.pneus?.milieu_etat || data?.pneus?.milieu_taille;
  return middle ? [TIRE_AXLES[0], LEGACY_MIDDLE_AXLE, TIRE_AXLES[1]] : [...TIRE_AXLES];
}

/** Libellé d'un essieu ajouté : le 3e, le 4e… (après l'avant et l'arrière). */
export const extraAxleLabel = (index: number) => `Pneus essieu ${index + 3}`;

/** Cases pouvant déclencher un forfait : toute la fiche sauf les niveaux (mêmes clés que la base). */
export const PACKAGE_TRIGGER_GROUPS: { title: string; fields: [string, string][] }[] = [
  { title: 'Usure', fields: WEAR_FIELDS.map(([key, label]) => [key, label]) },
  {
    title: 'Pneus',
    fields: [TIRE_AXLES[0], LEGACY_MIDDLE_AXLE, TIRE_AXLES[1]].map(([key, label]) => [
      `pneus.${key}_etat`,
      label,
    ]),
  },
  { title: 'Contrôles', fields: CHECK_FIELDS.map(([key, label]) => [`controles.${key}`, label]) },
  {
    title: 'Voyants allumés',
    fields: [
      ...WARNING_LIGHT_FIELDS.map(([key, label]): [string, string] => [`voyants.${key}`, `Voyant ${label}`]),
      ['probleme_electrique', 'Problème électrique'],
    ],
  },
];

/** Libellé d'une case déclencheuse de forfait (« Plaquettes avant », « Voyant ABS »…). */
export const triggerFieldLabel = (key: string) =>
  PACKAGE_TRIGGER_GROUPS.flatMap((group) => group.fields).find(([value]) => value === key)?.[1] ?? key;

export type WearKey = (typeof WEAR_FIELDS)[number][0];
export type CheckKey = (typeof CHECK_FIELDS)[number][0];
export type WarningLightKey = (typeof WARNING_LIGHT_FIELDS)[number][0];
export type FluidKey = (typeof FLUID_FIELDS)[number][0];

export interface InspectionData {
  usure?: Partial<Record<WearKey, string>>;
  pneus?: {
    avant_taille?: string;
    avant_etat?: string;
    milieu_taille?: string;
    milieu_etat?: string;
    arriere_taille?: string;
    arriere_etat?: string;
    /** Essieux ajoutés au-delà de l'avant et de l'arrière (et du milieu des anciennes fiches). */
    essieux?: { taille?: string; etat?: string }[];
  };
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
    data.pneus?.milieu_etat,
    data.pneus?.arriere_etat,
    ...(data.pneus?.essieux ?? []).map((axle) => axle.etat),
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
export function inspectionMissingPoints(
  data: InspectionData | null | undefined,
  vehicleType: VehicleKind | null | undefined = 'pl',
): number {
  const wear = wearFieldsFor(vehicleType).filter(
    ([key]) => !['OK', '50', 'HS'].includes(data?.usure?.[key] ?? ''),
  ).length;
  const tyres = (['avant_etat', 'arriere_etat'] as const).filter(
    (key) => !['OK', '50', 'HS'].includes(data?.pneus?.[key] ?? ''),
  ).length;
  const checks = CHECK_FIELDS.filter(([key]) => !['OK', 'HS'].includes(data?.controles?.[key] ?? '')).length;
  return wear + tyres + checks;
}
