import type { InspectionData } from '@/features/repair-orders/inspection';
import type { Enums } from '@/types/database';
import type { TireLot } from './api';
import { formatTireSize, isTireSize, type TireCategory, type TireProfile } from './domain';

type VehicleType = Enums<'vehicle_type'>;

/** Position relevée sur la fiche de contrôle : pneus à 50 % ou HS, avec leur taille. */
export interface TirePosition {
  key: string;
  label: string;
  state: '50' | 'HS';
  size: string;
  /** Profil du stock attendu pour cette position. */
  profile: TireProfile;
  /** Pneus à remplacer d'habitude (2 à l'avant, 4 à l'arrière d'un poids lourd). */
  quantity: number;
}

export const tireCategory = (vehicle: VehicleType): TireCategory => (vehicle === 'vul' ? 'vul' : 'pl');

const profileFor = (vehicle: VehicleType, position: 'avant' | 'arriere' | 'essieu'): TireProfile => {
  if (vehicle === 'vul') return 'toutes';
  if (vehicle === 'remorque') return 'remorque';
  return position === 'avant' ? 'avant' : 'arriere';
};

const worn = (state: string | undefined): state is '50' | 'HS' => state === '50' || state === 'HS';

/** Positions à remplacer d'après la fiche de contrôle (taille relevée, mise en forme du stock). */
export function inspectionPositions(inspection: InspectionData | null, vehicle: VehicleType): TirePosition[] {
  const pneus = inspection?.pneus;
  if (!pneus) return [];
  const rows: {
    key: string;
    label: string;
    state?: string;
    size?: string;
    position: 'avant' | 'arriere' | 'essieu';
  }[] = [
    {
      key: 'avant',
      label: 'Pneus avant',
      state: pneus.avant_etat,
      size: pneus.avant_taille,
      position: 'avant',
    },
    {
      key: 'milieu',
      label: 'Pneus milieu',
      state: pneus.milieu_etat,
      size: pneus.milieu_taille,
      position: 'essieu',
    },
    {
      key: 'arriere',
      label: 'Pneus arrière',
      state: pneus.arriere_etat,
      size: pneus.arriere_taille,
      position: 'arriere',
    },
    ...(pneus.essieux ?? []).map((axle, index) => ({
      key: `essieu-${index + 3}`,
      label: `Pneus essieu ${index + 3}`,
      state: axle.etat,
      size: axle.taille,
      position: 'essieu' as const,
    })),
  ];
  return rows.flatMap((row) => {
    const size = formatTireSize(row.size ?? '');
    if (!worn(row.state) || !isTireSize(size)) return [];
    return [
      {
        key: row.key,
        label: row.label,
        state: row.state,
        size,
        profile: profileFor(vehicle, row.position),
        quantity: row.position === 'arriere' && vehicle === 'pl' ? 4 : 2,
      },
    ];
  });
}

/** Lots proposés : le profil de la position d'abord, puis le plus de pneus disponibles. */
export const sortLots = (lots: TireLot[], profile: TireProfile) =>
  [...lots].sort(
    (a, b) =>
      Number(b.profile === profile) - Number(a.profile === profile) || b.available_qty - a.available_qty,
  );

/** Désignation de la ligne : celle de la pièce du lot (« Pneu Michelin X Multi Z 315/80 R22.5 »). */
export const lotDesignation = (lot: TireLot) =>
  [
    'Pneu',
    lot.brand_name,
    lot.model,
    lot.size,
    lot.condition === 'rechape' ? 'rechapé' : lot.condition === 'occasion' ? 'occasion' : '',
  ]
    .filter(Boolean)
    .join(' ');
