import type { KioskClockResult } from './api';

export type KioskTone = 'info' | 'success' | 'warning' | 'error';

export interface KioskMessage {
  tone: KioskTone;
  title: string;
  detail?: string;
  /** Délai avant de revenir à la saisie du code (ms). */
  resetAfter: number;
}

export const IDLE_MESSAGE: KioskMessage = { tone: 'info', title: 'Tape ton code PIN puis OK', resetAfter: 0 };
export const CAMERA_MESSAGE: KioskMessage = {
  tone: 'error',
  title: 'Caméra indisponible — pointage impossible. Préviens le bureau.',
  resetAfter: 3500,
};
export const NETWORK_MESSAGE: KioskMessage = {
  tone: 'error',
  title: 'Erreur réseau — réessaie',
  resetAfter: 2500,
};

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** Réponse affichée sur la borne (textes de l'ancienne appli). */
export function kioskMessage(result: KioskClockResult): KioskMessage {
  if (result.ok) {
    return result.event_type === 'in'
      ? {
          tone: 'success',
          title: `Bonjour ${result.technician_name}`,
          detail: `Arrivée enregistrée à ${time(result.occurred_at)}`,
          resetAfter: 3500,
        }
      : {
          tone: 'warning',
          title: `Au revoir ${result.technician_name}`,
          detail: `Départ enregistré à ${time(result.occurred_at)}`,
          resetAfter: 3500,
        };
  }
  if (result.message === 'Code incorrect') return { tone: 'error', title: result.message, resetAfter: 1800 };
  if (result.message.startsWith('Déjà pointé'))
    return { tone: 'warning', title: result.message, resetAfter: 2500 };
  return { tone: 'error', title: result.message, resetAfter: 3500 };
}
