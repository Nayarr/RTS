// Outils de l'assistant de la direction : uniquement des lectures, faites avec le client Supabase
// de la personne connectée (mêmes droits que dans l'appli, règles d'accès de la base comprises).
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date attendue au format AAAA-MM-JJ');
const month = z.string().regex(/^\d{4}-\d{2}$/, 'mois attendu au format AAAA-MM');

/** Période « du … au … » : dates valides, dans l'ordre, au plus `maxDays` jours. */
const period = (maxDays: number) =>
  z.object({ du: day, au: day }).refine(
    ({ du, au }) => {
      const from = Date.parse(`${du}T00:00:00Z`);
      const to = Date.parse(`${au}T00:00:00Z`);
      return Number.isFinite(from) && Number.isFinite(to) && to >= from && to - from <= maxDays * 86_400_000;
    },
    { message: `période invalide : « du » avant « au », ${maxDays} jours au plus` },
  );

const DATE_PROPERTY = { type: 'string', description: 'Date au format AAAA-MM-JJ' } as const;
const PERIOD_SCHEMA = {
  type: 'object',
  properties: { du: DATE_PROPERTY, au: DATE_PROPERTY },
  required: ['du', 'au'],
  additionalProperties: false,
} as const;
const NO_INPUT = { type: 'object', properties: {}, additionalProperties: false } as const;

/** Identifiants, couleurs et liens publics retirés : inutiles pour répondre, coûteux en jetons. */
export function compact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(compact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !/(^id$|_id$|_ids$|color$|token$|file_id$)/.test(key))
        .map(([key, item]) => [key, compact(item)]),
    );
  }
  return value;
}

type Db = SupabaseClient;
type Result = { data: unknown; error: { message: string } | null };

async function rows(query: PromiseLike<Result>) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return compact(data);
}

interface AgentTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  input: z.ZodType;
  run: (db: Db, input: never) => Promise<unknown>;
}

const tool = <S extends z.ZodType>(
  spec: Omit<AgentTool, 'input' | 'run'> & { input: S; run: (db: Db, input: z.infer<S>) => Promise<unknown> },
): AgentTool => spec as AgentTool;

export const TOOLS: AgentTool[] = [
  tool({
    name: 'tableau_de_bord',
    description:
      'Situation du moment : OR par statut, charge du jour par technicien, factures en retard (nombre et montant), devis en attente, rendez-vous du jour, congés à valider, pièces à commander.',
    input_schema: NO_INPUT,
    input: z.object({}),
    run: (db) => rows(db.rpc('office_dashboard')),
  }),
  tool({
    name: 'chiffres_du_mois',
    description:
      'Bilan d’un mois : CA HT (main-d’œuvre, pièces, marge pièces), encaissé, impayés, OR ouverts, devis acceptés, échéances de contrôles à venir.',
    input_schema: {
      type: 'object',
      properties: { mois: { type: 'string', description: 'Mois au format AAAA-MM' } },
      required: ['mois'],
      additionalProperties: false,
    },
    input: z.object({ mois: month }),
    run: (db, { mois }) => rows(db.rpc('monthly_report', { p_month: `${mois}-01` })),
  }),
  tool({
    name: 'evolution_mensuelle',
    description:
      'CA HT mois par mois sur les derniers mois (factures, main-d’œuvre, pièces, marge pièces, avoirs) : pour comparer ou voir une tendance.',
    input_schema: {
      type: 'object',
      properties: { nombre_de_mois: { type: 'integer', minimum: 1, maximum: 24 } },
      required: ['nombre_de_mois'],
      additionalProperties: false,
    },
    input: z.object({ nombre_de_mois: z.number().int().min(1).max(24) }),
    run: (db, { nombre_de_mois }) => rows(db.rpc('monthly_statistics', { p_months: nombre_de_mois })),
  }),
  tool({
    name: 'tresorerie',
    description:
      'Encaissements attendus semaine par semaine, montant en retard et habitudes de paiement des clients (délai moyen).',
    input_schema: NO_INPUT,
    input: z.object({}),
    run: (db) => rows(db.rpc('treasury_overview')),
  }),
  tool({
    name: 'factures_impayees',
    description:
      'Factures émises pas encore soldées, les plus anciennes d’abord : numéro, client, montant, reste dû, échéance, relances.',
    input_schema: {
      type: 'object',
      properties: {
        en_retard_seulement: { type: 'boolean', description: 'Seulement celles dont l’échéance est passée' },
      },
      required: ['en_retard_seulement'],
      additionalProperties: false,
    },
    input: z.object({ en_retard_seulement: z.boolean() }),
    run: (db, { en_retard_seulement }) => {
      let query = db
        .from('v_invoices_overview')
        .select('number, client_name, total_ttc, balance_due, due_date, reminders_count, last_reminder_at')
        .eq('status', 'issued')
        .gt('balance_due', 0)
        .order('due_date')
        .limit(40);
      if (en_retard_seulement) query = query.lt('due_date', new Date().toISOString().slice(0, 10));
      return rows(query);
    },
  }),
  tool({
    name: 'atelier_aujourdhui',
    description:
      'Atelier en direct : OR du jour par technicien (tâche, plaque, statut, chrono en cours, pièces en attente) et absences.',
    input_schema: NO_INPUT,
    input: z.object({}),
    run: (db) => rows(db.rpc('workshop_board')),
  }),
  tool({
    name: 'charge_atelier',
    description:
      'Charge de travail sur une période : heures disponibles, déclarées et planifiées par technicien, OR à planifier. 62 jours au plus.',
    input_schema: PERIOD_SCHEMA,
    input: period(62),
    run: (db, { du, au }) => rows(db.rpc('workshop_workload', { p_from: du, p_to: au })),
  }),
  tool({
    name: 'rendez_vous',
    description: 'Rendez-vous sur une période : date, heure, client, plaque, motif, technicien, statut.',
    input_schema: PERIOD_SCHEMA,
    input: period(62),
    run: (db, { du, au }) =>
      rows(
        db.from('v_appointments_overview')
          .select('scheduled_date, start_time, client_name, plate, reason, technician_name, status')
          .gte('scheduled_date', du)
          .lte('scheduled_date', au)
          .order('scheduled_date')
          .order('start_time')
          .limit(60),
      ),
  }),
  tool({
    name: 'devis',
    description:
      'Devis récents avec leur statut (draft brouillon, in_progress en préparation, sent envoyé, accepted accepté, refused refusé) : numéro, client, plaque, montant TTC, validité.',
    input_schema: {
      type: 'object',
      properties: {
        statut: {
          type: 'string',
          enum: ['tous', 'draft', 'in_progress', 'sent', 'accepted', 'refused'],
          description: 'Filtrer sur un statut, ou « tous »',
        },
      },
      required: ['statut'],
      additionalProperties: false,
    },
    input: z.object({ statut: z.enum(['tous', 'draft', 'in_progress', 'sent', 'accepted', 'refused']) }),
    run: (db, { statut }) => {
      let query = db
        .from('v_quotes_overview')
        .select(
          'number, status, client_name, plate, total_ttc, issued_at, valid_until, accepted_at, refused_at',
        )
        .order('created_at', { ascending: false })
        .limit(30);
      if (statut !== 'tous') query = query.eq('status', statut);
      return rows(query);
    },
  }),
  tool({
    name: 'rentabilite',
    description:
      'Rentabilité par client et véhicule sur une période : nombre d’OR, main-d’œuvre, pièces, marge, heures facturées et travaillées, impayés. Les 25 plus gros.',
    input_schema: PERIOD_SCHEMA,
    input: period(366),
    run: async (db, { du, au }) => {
      const { data, error } = await db.rpc('profitability_report', { p_from: du, p_to: au });
      if (error) throw new Error(error.message);
      const list = (data ?? []) as { labor_ht: number; parts_ht: number }[];
      return compact(
        [...list].sort((a, b) => b.labor_ht + b.parts_ht - (a.labor_ht + a.parts_ht)).slice(0, 25),
      );
    },
  }),
  tool({
    name: 'performance_techniciens',
    description:
      'Par technicien sur une période : main-d’œuvre facturée, nombre d’OR, heures facturées, travaillées et de présence, écart aux estimations, délai moyen.',
    input_schema: PERIOD_SCHEMA,
    input: period(366),
    run: (db, { du, au }) => rows(db.rpc('technician_performance', { p_from: du, p_to: au })),
  }),
  tool({
    name: 'echeances_vehicules',
    description:
      'Contrôles à venir ou dépassés (kind ct : contrôle technique, tailgate : hayon) : plaque, client, date, jours restants (négatif = dépassé).',
    input_schema: {
      type: 'object',
      properties: { dans_les_jours: { type: 'integer', minimum: 0, maximum: 365 } },
      required: ['dans_les_jours'],
      additionalProperties: false,
    },
    input: z.object({ dans_les_jours: z.number().int().min(0).max(365) }),
    run: (db, { dans_les_jours }) =>
      rows(
        db.from('v_vehicle_deadlines')
          .select('plate, client_name, kind, due_date, days_left')
          .lte('days_left', dans_les_jours)
          .order('days_left')
          .limit(50),
      ),
  }),
  tool({
    name: 'locations',
    description:
      'Locations de véhicules en cours ou à venir : numéro, statut, client, plaque, départ, retour prévu, retard.',
    input_schema: NO_INPUT,
    input: z.object({}),
    run: (db) =>
      rows(
        db.from('v_rentals_overview')
          .select(
            'number, status, client_name, plate, brand, model, departure_at, planned_return_at, is_late',
          )
          .in('status', ['reserved', 'active'])
          .order('departure_at')
          .limit(40),
      ),
  }),
  tool({
    name: 'recherche',
    description:
      'Recherche un client, un véhicule (plaque), un OR, un devis ou une facture par nom, plaque ou numéro.',
    input_schema: {
      type: 'object',
      properties: { texte: { type: 'string', minLength: 2, maxLength: 80 } },
      required: ['texte'],
      additionalProperties: false,
    },
    input: z.object({ texte: z.string().trim().min(2).max(80) }),
    run: (db, { texte }) => rows(db.rpc('global_search', { p_query: texte })),
  }),
];

/** Définitions envoyées à l'assistant (nom, rôle, schéma des paramètres). */
export const TOOL_DEFINITIONS = TOOLS.map(({ name, description, input_schema }) => ({
  name,
  description,
  input_schema: input_schema as { type: 'object'; [key: string]: unknown },
}));

/** Exécute un outil demandé par l'assistant ; une erreur devient un résultat lisible par lui. */
export async function runTool(
  db: Db,
  name: string,
  input: unknown,
): Promise<{ content: string; is_error: boolean }> {
  const found = TOOLS.find((item) => item.name === name);
  if (!found) return { content: `Outil inconnu : ${name}`, is_error: true };
  const parsed = found.input.safeParse(input);
  if (!parsed.success) {
    return { content: `Paramètres invalides : ${parsed.error.issues[0]?.message ?? ''}`, is_error: true };
  }
  try {
    const result = await found.run(db, parsed.data as never);
    return { content: JSON.stringify(result), is_error: false };
  } catch (error) {
    return {
      content: `Lecture impossible : ${error instanceof Error ? error.message : 'erreur'}`,
      is_error: true,
    };
  }
}
