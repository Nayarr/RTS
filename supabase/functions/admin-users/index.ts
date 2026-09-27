// =============================================================================
// Edge Function « admin-users » : gestion des comptes de l'équipe (direction).
//
// Seul endroit de l'appli qui utilise la clé secrète Supabase, pour :
//   - create     : créer un compte (invitation par e-mail ou mot de passe provisoire)
//                  + son profil et sa fiche technicien (transaction SQL) ;
//   - set_active : désactiver / réactiver un compte (profil + blocage de connexion).
// Le reste de la gestion (nom, rôle, fiche technicien, PIN) passe par la base
// avec les droits de la direction (RLS).
// =============================================================================
import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';
import { z } from 'zod';

z.config(z.locales.fr()); // messages de validation en français

const ROLES = ['direction', 'reception', 'technician', 'kiosk'] as const;
const BAN_FOREVER = '876000h'; // ~100 ans : compte bloqué jusqu'à réactivation

const technicianSchema = z.object({
  display_name: z.string().trim().min(1).max(40),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullish(),
  exclude_from_planning: z.boolean().optional(),
});

const createSchema = z.object({
  action: z.literal('create'),
  email: z.email(),
  full_name: z.string().trim().min(1).max(80),
  role: z.enum(ROLES),
  technician: technicianSchema.nullish(),
  // Absent : e-mail d'invitation (la personne choisit son mot de passe).
  password: z.string().min(10).max(72).optional(),
  redirect_to: z.url().optional(),
});

const setActiveSchema = z.object({
  action: z.literal('set_active'),
  user_id: z.guid(),
  active: z.boolean(),
});

const requestSchema = z.discriminatedUnion('action', [createSchema, setActiveSchema]);

const json = (status: number, body: unknown) => Response.json(body, { status });
const fail = (status: number, error: string) => json(status, { error });

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return fail(405, 'Méthode non autorisée');

    // L'appelant doit être une direction active (vérifié côté base, avec ses propres droits).
    const { data: isDirection, error: roleError } = await ctx.supabase.rpc('is_direction');
    if (roleError || isDirection !== true) return fail(403, 'Accès réservé à la direction');

    const parsed = requestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return json(400, { error: 'Requête invalide', details: parsed.error.issues.map((i) => i.message) });
    }
    const request = parsed.data;
    const admin = ctx.supabaseAdmin;

    // ------------------------------------------------------------------ create
    if (request.action === 'create') {
      if (request.role === 'technician' && !request.technician) {
        return fail(400, 'Un compte technicien doit avoir une fiche technicien');
      }
      const email = request.email.trim().toLowerCase();

      const created = request.password
        ? await admin.auth.admin.createUser({ email, password: request.password, email_confirm: true })
        : await admin.auth.admin.inviteUserByEmail(email, { redirectTo: request.redirect_to });

      if (created.error || !created.data.user) {
        const exists = created.error?.code === 'email_exists' || created.error?.status === 422;
        return fail(
          exists ? 409 : 500,
          exists ? 'Un compte existe déjà avec cet e-mail' : 'Création du compte impossible',
        );
      }
      const userId = created.data.user.id;

      const { error: registerError } = await admin.rpc('admin_register_account', {
        p_user_id: userId,
        p_email: email,
        p_full_name: request.full_name,
        p_role: request.role,
        p_technician: request.technician ?? null,
      });

      if (registerError) {
        // Pas de compte à moitié créé : on supprime le compte d'authentification.
        await admin.auth.admin.deleteUser(userId);
        return fail(500, "Enregistrement du profil impossible : le compte n'a pas été créé");
      }
      return json(201, { user_id: userId, invited: !request.password });
    }

    // -------------------------------------------------------------- set_active
    if (!request.active && request.user_id === ctx.userClaims?.id) {
      return fail(400, 'Tu ne peux pas désactiver ton propre compte');
    }

    // D'abord le profil : le trigger refuse de désactiver la dernière direction.
    const { error: profileError } = await admin
      .from('profiles')
      .update({ is_active: request.active })
      .eq('id', request.user_id);
    if (profileError) {
      const lastDirection = profileError.message.includes('au moins un compte Direction');
      return fail(
        lastDirection ? 409 : 500,
        lastDirection ? profileError.message : 'Mise à jour du compte impossible',
      );
    }

    // Puis la connexion : un compte désactivé ne peut plus se connecter ni renouveler sa session.
    const { error: banError } = await admin.auth.admin.updateUserById(request.user_id, {
      ban_duration: request.active ? 'none' : BAN_FOREVER,
    });
    if (banError) {
      await admin.from('profiles').update({ is_active: !request.active }).eq('id', request.user_id);
      return fail(500, 'Blocage de la connexion impossible : aucune modification enregistrée');
    }

    return json(200, { user_id: request.user_id, active: request.active });
  }),
};
