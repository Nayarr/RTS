// Dépannage extérieur : lieu d'intervention (Géoplateforme de l'IGN), trajet aller-retour (fonction
// « trajet », TomTom), prix du déplacement par zone (même règle que la base : roadside_travel).
import { invokeFunction } from '@/lib/functions';
import type { Tables } from '@/types/database';

type AppSettings = Tables<'app_settings'>;

export type RoadsideSettings = Pick<
  AppSettings,
  | 'roadside_flat_fee'
  | 'roadside_zone2_price'
  | 'roadside_zone3_price'
  | 'roadside_zone1_max_km'
  | 'roadside_zone2_max_km'
  | 'roadside_zone3_max_km'
  | 'roadside_zone1_max_minutes'
  | 'roadside_zone2_max_minutes'
  | 'roadside_zone3_max_minutes'
  | 'roadside_tolerance_minutes'
  | 'roadside_travel_hourly_rate'
>;

export interface RoadsideTravel {
  zone: 1 | 2 | 3 | 4;
  /** Null : au-delà de la zone 3, prix à saisir. */
  price: number | null;
  /** Temps de trajet facturé à la place du forfait de la zone. */
  byTime: boolean;
}

/** « 40 min », « 1 h », « 1 h 20 ». */
export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return `${Math.floor(minutes / 60)} h${rest ? ` ${String(rest).padStart(2, '0')}` : ''}`;
}

/**
 * Zone de la distance aller-retour (moins de 10 km, 10 à 20, 20 à 40, au-delà), forfait de la zone,
 * ou temps de trajet (1 h au moins, puis à la minute) au-delà du temps de la zone (zone 1 sans
 * tolérance, zones 2 et 3 avec). Un prix saisi à la main remplace le calcul.
 */
export function roadsideTravel(
  km: number,
  minutes: number,
  manualPrice: number | null,
  s: RoadsideSettings,
): RoadsideTravel {
  const zone =
    km < s.roadside_zone1_max_km
      ? 1
      : km < s.roadside_zone2_max_km
        ? 2
        : km <= s.roadside_zone3_max_km
          ? 3
          : 4;
  if (zone === 4 || manualPrice !== null) return { zone, price: manualPrice, byTime: false };
  const forfait = [s.roadside_flat_fee, s.roadside_zone2_price, s.roadside_zone3_price][zone - 1]!;
  const max = [s.roadside_zone1_max_minutes, s.roadside_zone2_max_minutes, s.roadside_zone3_max_minutes][
    zone - 1
  ]!;
  const tolerance = zone === 1 ? 0 : s.roadside_tolerance_minutes;
  if (minutes > max + tolerance) {
    return {
      zone,
      price: Math.round((s.roadside_travel_hourly_rate * Math.max(60, minutes) * 100) / 60) / 100,
      byTime: true,
    };
  }
  return { zone, price: forfait, byTime: false };
}

export interface Place {
  label: string;
  lat: number;
  lon: number;
}

interface GeoplateformeResult {
  features?: { properties?: { label?: string }; geometry?: { coordinates?: [number, number] } }[];
}

/** Adresses trouvées par le service de géocodage de l'IGN (gratuit, sans clé). */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const url = `https://data.geopf.fr/geocodage/search?${new URLSearchParams({ q, limit: '5', index: 'address' })}`;
  const response = await fetch(url, { signal });
  if (!response.ok) return [];
  const data = (await response.json()) as GeoplateformeResult;
  return (data.features ?? []).flatMap((feature) => {
    const [lon, lat] = feature.geometry?.coordinates ?? [];
    const label = feature.properties?.label;
    return label && lat !== undefined && lon !== undefined ? [{ label, lat, lon }] : [];
  });
}

/** Trajet aller-retour de l'atelier au lieu (trafic compris), par la fonction « trajet ». */
export function computeTrip(from: Place, to: Place, departAt: string | null) {
  return invokeFunction<{ km: number; minutes: number }>('trajet', {
    from: { lat: from.lat, lon: from.lon },
    to: { lat: to.lat, lon: to.lon },
    ...(departAt ? { depart_at: departAt } : {}),
  });
}

/** Champs enregistrés sur l'OR. */
export interface RoadsideValue {
  enabled: boolean;
  address: string;
  km: number | null;
  minutes: number | null;
  manualPrice: number | null;
}

export const NO_ROADSIDE: RoadsideValue = {
  enabled: false,
  address: '',
  km: null,
  minutes: null,
  manualPrice: null,
};

export const roadsideFromOrder = (
  order: Pick<
    Tables<'repair_orders'>,
    'intervention_type' | 'roadside_address' | 'roadside_km' | 'roadside_minutes' | 'roadside_price_ht'
  >,
): RoadsideValue => ({
  enabled: order.intervention_type === 'roadside',
  address: order.roadside_address ?? '',
  km: order.roadside_km,
  minutes: order.roadside_minutes,
  manualPrice: order.roadside_price_ht,
});

export const roadsidePatch = (value: RoadsideValue) =>
  value.enabled
    ? {
        intervention_type: 'roadside' as const,
        roadside_address: value.address.trim() || null,
        roadside_km: value.km,
        roadside_minutes: value.minutes,
        roadside_price_ht: value.manualPrice,
      }
    : {
        intervention_type: 'workshop' as const,
        roadside_address: null,
        roadside_km: null,
        roadside_minutes: null,
        roadside_price_ht: null,
      };

/** Ce qui manque avant d'enregistrer un dépannage. */
export function roadsideProblem(value: RoadsideValue, s: RoadsideSettings | undefined): string | null {
  if (!value.enabled) return null;
  if (!value.address.trim()) return 'Indique le lieu d’intervention du dépannage';
  if (value.km === null || value.minutes === null)
    return 'Indique la distance et le temps de trajet aller-retour';
  if (s && value.manualPrice === null && roadsideTravel(value.km, value.minutes, null, s).zone === 4) {
    return 'Au-delà de la zone 3 : indique le prix du déplacement';
  }
  return null;
}
