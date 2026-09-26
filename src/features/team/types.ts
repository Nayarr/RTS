import type { AppRole, Profile } from '@/features/auth/roles';
import type { Database } from '@/types/database';

export type Technician = Database['public']['Tables']['technicians']['Row'];
export type RestGroup = Database['public']['Enums']['rest_group'];

/** Un membre de l'équipe : son compte, sa fiche technicien éventuelle et l'état de son PIN. */
export interface TeamMember extends Profile {
  technician: Technician | null;
  pinSetAt: string | null;
}

export interface CreateAccountInput {
  email: string;
  full_name: string;
  role: AppRole;
  technician: { display_name: string; color: string | null } | null;
  /** Absent : invitation par e-mail (la personne choisit son mot de passe). */
  password?: string;
}

export interface TechnicianSettings {
  display_name: string;
  color: string | null;
  exclude_from_planning: boolean;
  rest_group: RestGroup | null;
}
