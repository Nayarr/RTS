// Trajet aller-retour d'un dépannage : demande et réponse du calcul d'itinéraire (TomTom).
import { z } from 'zod';

const point = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) });

export const requestSchema = z.object({
  from: point,
  to: point,
  /** Départ prévu (trafic de ce moment) ; sinon maintenant (trafic en temps réel). */
  depart_at: z.iso.datetime({ offset: true }).optional(),
});
export type RouteRequest = z.infer<typeof requestSchema>;

/** Résumé d'un itinéraire TomTom (temps trafic compris quand traffic=true). */
export const tomtomSchema = z.object({
  routes: z
    .array(z.object({ summary: z.object({ lengthInMeters: z.number(), travelTimeInSeconds: z.number() }) }))
    .min(1),
});

/** Adresse du calcul d'itinéraire (voiture, trafic compris, départ donné ou maintenant). */
export function routeUrl(
  base: string,
  key: string,
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  departAt: string | null,
): string {
  const params = new URLSearchParams({
    key,
    traffic: 'true',
    travelMode: 'car',
    routeType: 'fastest',
    departAt: departAt ?? 'now',
  });
  return `${base}/${from.lat},${from.lon}:${to.lat},${to.lon}/json?${params}`;
}

/** Aller et retour additionnés : km (au dixième) et minutes (arrondies à la minute). */
export function roundTrip(legs: { meters: number; seconds: number }[]) {
  const meters = legs.reduce((sum, leg) => sum + leg.meters, 0);
  const seconds = legs.reduce((sum, leg) => sum + leg.seconds, 0);
  return { km: Math.round(meters / 100) / 10, minutes: Math.round(seconds / 60) };
}
