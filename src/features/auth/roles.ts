import type { Database } from '@/types/database';

export type AppRole = Database['public']['Enums']['app_role'];
export type Profile = Database['public']['Tables']['profiles']['Row'];

export const ROLE_LABELS: Record<AppRole, string> = {
  direction: 'Direction',
  reception: 'Réception',
  technician: 'Technicien',
  kiosk: 'Borne atelier',
};

/** Bureau = direction + réception (accès au tableau de bord). */
export const isOfficeRole = (role: AppRole) => role === 'direction' || role === 'reception';
