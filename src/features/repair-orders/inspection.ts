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
    fields: [
      ...[TIRE_AXLES[0], LEGACY_MIDDLE_AXLE, TIRE_AXLES[1]].map(([key, label]): [string, string] => [
        `pneus.${key}_etat`,
        label,
      ]),
      // Chaque essieu ajouté déclenche son propre lot de forfaits
      ['pneus.essieu_etat', 'Pneus d’un essieu ajouté'],
    ],
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
  /** Prochain contrôle hayon lu en scannant l'étiquette sur cet OR (1er jour du mois). */
  hayon_echeance?: string;
  probleme_electrique?: string;
  voyants?: Partial<Record<WarningLightKey, boolean>>;
  voyants_autres?: string;
  niveaux?: Partial<Record<FluidKey, { etat?: string; litres?: string | number }>>;
  /** Remorque : freins et pneus par essieu (remplace avant / arrière des anciennes fiches). */
  remorque_essieux?: TrailerAxle[];
}

/** Essieu d'une remorque : disques, plaquettes et pneus (état, taille). */
export interface TrailerAxle {
  disques?: string;
  plaquettes?: string;
  pneus_etat?: string;
  pneus_taille?: string;
}

/** Remorque : 3 essieux au départ, ajoutables ou retirables (un au moins). */
export const TRAILER_DEFAULT_AXLES = 3;

export const TRAILER_AXLE_WEAR = [
  ['disques', 'Disques de frein'],
  ['plaquettes', 'Plaquettes'],
] as const;

export const trailerAxleLabel = (index: number) => `Essieu ${index + 1}`;

/** Essieu laissé vide : considéré comme inexistant (ni point manquant, ni alerte, ni forfait). */
export const axleFilled = (axle: TrailerAxle) =>
  Boolean(axle.disques || axle.plaquettes || axle.pneus_etat || axle.pneus_taille?.trim());

/** Ancienne fiche de remorque : avant, arrière et essieux ajoutés (essieux 1, 2, 3…). */
function legacyTrailerAxles(data: InspectionData | null | undefined): TrailerAxle[] {
  const clean = (axle: TrailerAxle): TrailerAxle =>
    Object.fromEntries(Object.entries(axle).filter(([, value]) => value));
  return [
    clean({
      disques: data?.usure?.disques_avant,
      plaquettes: data?.usure?.plaquettes_avant,
      pneus_etat: data?.pneus?.avant_etat,
      pneus_taille: data?.pneus?.avant_taille,
    }),
    clean({
      disques: data?.usure?.disques_arriere,
      plaquettes: data?.usure?.plaquettes_arriere,
      pneus_etat: data?.pneus?.arriere_etat,
      pneus_taille: data?.pneus?.arriere_taille,
    }),
    ...(data?.pneus?.essieux ?? []).map((axle) =>
      clean({ pneus_etat: axle.etat, pneus_taille: axle.taille }),
    ),
  ];
}

/**
 * Fiche de remorque par essieu : enregistrée ainsi, ou pas encore remplie. Une ancienne fiche
 * remplie (avant / arrière) garde ses règles tant qu'elle n'est pas modifiée.
 */
export const usesTrailerAxles = (data: InspectionData | null | undefined) =>
  Array.isArray(data?.remorque_essieux) || !legacyTrailerAxles(data).some(axleFilled);

/** Essieux de la remorque à afficher : ceux de la fiche, sinon l'ancienne fiche reprise, au moins 3. */
export function trailerAxles(data: InspectionData | null | undefined): TrailerAxle[] {
  if (data?.remorque_essieux?.length) return data.remorque_essieux;
  const legacy = legacyTrailerAxles(data);
  while (legacy.length > TRAILER_DEFAULT_AXLES && !axleFilled(legacy.at(-1)!)) legacy.pop();
  while (legacy.length < TRAILER_DEFAULT_AXLES) legacy.push({});
  return legacy;
}

/** Essieux remplis (au moins le premier) : ceux qui comptent pour la fiche complète. */
const countedAxles = (axles: TrailerAxle[]) => {
  const filled = axles.filter(axleFilled);
  return filled.length ? filled : axles.slice(0, 1);
};

/** Libellé et couleur d'une valeur saisie (« HS » → rouge…). */
export function optionFor(value: string | undefined, options: ChipOption[]) {
  return options.find((option) => option.value === value);
}

/** Nombre de points signalés (HS, 50 %, voyants, problème électrique) : résumé pour le bureau. */
export function countAlerts(data: InspectionData | null | undefined): number {
  if (!data) return 0;
  // Remorque par essieu : freins et pneus des essieux, plus ceux de l'ancienne fiche
  const axles = Array.isArray(data.remorque_essieux) ? data.remorque_essieux : null;
  const values = [
    ...Object.entries(data.usure ?? {})
      .filter(([key]) => !axles || !/^(disques|plaquettes)_/.test(key))
      .map(([, value]) => value),
    ...(axles
      ? axles.flatMap((axle) => [axle.disques, axle.plaquettes, axle.pneus_etat])
      : [
          data.pneus?.avant_etat,
          data.pneus?.milieu_etat,
          data.pneus?.arriere_etat,
          ...(data.pneus?.essieux ?? []).map((axle) => axle.etat),
        ]),
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
  const checks = CHECK_FIELDS.filter(([key]) => !['OK', 'HS'].includes(data?.controles?.[key] ?? '')).length;
  // Remorque par essieu : disques, plaquettes et pneus des essieux remplis (au moins le premier)
  if (vehicleType === 'remorque' && usesTrailerAxles(data)) {
    const axles = countedAxles(trailerAxles(data));
    const states = axles.flatMap((axle) => [axle.disques, axle.plaquettes, axle.pneus_etat]);
    return states.filter((value) => !['OK', '50', 'HS'].includes(value ?? '')).length + checks;
  }
  const wear = wearFieldsFor(vehicleType).filter(
    ([key]) => !['OK', '50', 'HS'].includes(data?.usure?.[key] ?? ''),
  ).length;
  const tyres = (['avant_etat', 'arriere_etat'] as const).filter(
    (key) => !['OK', '50', 'HS'].includes(data?.pneus?.[key] ?? ''),
  ).length;
  return wear + tyres + checks;
}
