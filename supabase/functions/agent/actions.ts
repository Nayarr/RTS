// Actions que l'assistant de la direction peut PRÉPARER : rendez-vous, travail à ajouter sur un OR,
// technicien à assigner, mail (relance d'un retard de paiement, mail libre ; envoyé par mail-send
// après validation). Un outil ne fait que lire (vérifier l'OR, le véhicule, le technicien)
// puis noter l'action proposée dans agent_actions ; elle s'exécute seulement quand la direction la
// valide dans l'appli (execute_agent_action). Rien d'autre n'est écrit.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { docNumber, plateKey } from './tools.ts';

type Db = SupabaseClient;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date attendue au format AAAA-MM-JJ');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'heure attendue au format HH:MM');
const text = (max = 200) => z.string().trim().min(1).max(max);
const string = (description: string) => ({ type: 'string', description });
const schema = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

export interface ProposedAction {
  id: string;
  kind: 'appointment' | 'ro_work' | 'assign_technician' | 'send_mail';
  summary: string;
}

interface ActionTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  input: z.ZodType;
  run: (db: Db, input: never, conversationId: string | null) => Promise<ProposedAction>;
}

const action = <S extends z.ZodType>(
  spec: Omit<ActionTool, 'input' | 'run'> & {
    input: S;
    run: (db: Db, input: z.infer<S>, conversationId: string | null) => Promise<ProposedAction>;
  },
): ActionTool => spec as ActionTool;

/** « 2026-10-14 » → « mardi 14 octobre ». */
export const frenchDay = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
const hour = (value: string) => `${Number(value.slice(0, 2))}h${value.slice(3, 5)}`;
const parisToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());

/** Technicien actif reconnu par son prénom (sans accent ni casse). */
async function findTechnician(db: Db, name: string): Promise<{ id: string; display_name: string }> {
  const { data, error } = await db.from('technicians').select('id, display_name').eq('is_active', true);
  if (error) throw new Error(error.message);
  const key = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const wanted = key(name);
  const list = (data ?? []) as { id: string; display_name: string }[];
  const found = list.filter((tech) => key(tech.display_name) === wanted);
  const match = found.length ? found : list.filter((tech) => key(tech.display_name).startsWith(wanted));
  if (match.length !== 1) {
    throw new Error(
      match.length
        ? `plusieurs techniciens « ${name} »`
        : `technicien « ${name} » inconnu (${list.map((t) => t.display_name).join(', ')})`,
    );
  }
  return match[0]!;
}

/** OR désigné par son numéro, sinon l'OR en cours du véhicule (le plus récent pas encore facturé). */
async function findOrder(
  db: Db,
  input: { numero_or?: string | undefined; immatriculation?: string | undefined },
): Promise<{ id: string; number: string; plate: string | null; status: string }> {
  let query = db.from('v_repair_orders_overview').select('id, number, plate, status');
  if (input.numero_or) query = query.eq('number', docNumber('OR', input.numero_or));
  else if (input.immatriculation) {
    query = query.eq('plate_key', plateKey(input.immatriculation)).not(
      'status',
      'in',
      '(to_invoice,invoiced)',
    );
  } else throw new Error('indique le numéro de l’OR ou l’immatriculation');
  const { data, error } = await query.order('created_at', { ascending: false }).limit(1);
  if (error) throw new Error(error.message);
  const order = (data ?? [])[0] as
    | { id: string; number: string; plate: string | null; status: string }
    | undefined;
  if (!order) throw new Error('OR introuvable');
  if (order.status === 'to_invoice' || order.status === 'invoiced') {
    throw new Error(`l’OR ${order.number} est déjà terminé`);
  }
  return order;
}

/** Note l'action proposée (droits de la personne connectée : direction seulement). */
async function propose(
  db: Db,
  conversationId: string | null,
  kind: ProposedAction['kind'],
  payload: Record<string, unknown>,
  summary: string,
): Promise<ProposedAction> {
  const { data, error } = await db
    .from('agent_actions')
    .insert({ kind, payload, summary, conversation_id: conversationId })
    .select('id, kind, summary')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'action non préparée');
  return data as ProposedAction;
}

export const ACTION_TOOLS: ActionTool[] = [
  action({
    name: 'preparer_rendez_vous',
    description:
      'Prépare un rendez-vous (date, heure, véhicule ou client, motif, technicien facultatif). Ne le crée pas : la direction le valide ensuite dans l’appli.',
    input_schema: schema(
      {
        date: string('Jour du rendez-vous au format AAAA-MM-JJ'),
        heure: string('Heure de début au format HH:MM'),
        duree_minutes: { type: 'integer', minimum: 15, maximum: 600 },
        immatriculation: string('Immatriculation du véhicule'),
        client: string('Nom du client'),
        motif: string('Motif du rendez-vous (ex. vidange, contrôle technique)'),
        technicien: string('Prénom du technicien, facultatif'),
      },
      ['date', 'heure', 'motif'],
    ),
    input: z
      .object({
        date: day,
        heure: time,
        duree_minutes: z.number().int().min(15).max(600).optional(),
        immatriculation: z.string().trim().max(20).optional(),
        client: z.string().trim().max(120).optional(),
        motif: text(),
        technicien: z.string().trim().max(60).optional(),
      })
      .refine((value) => value.immatriculation || value.client, {
        message: 'indique l’immatriculation ou le client',
      }),
    run: async (db, input, conversationId) => {
      if (input.date < parisToday()) throw new Error('date passée');
      const plate = input.immatriculation ?? '';
      let vehicleType = 'pl';
      let clientName = input.client ?? '';
      if (plate) {
        const { data } = await db
          .from('v_vehicles_overview')
          .select('vehicle_type, client_name')
          .eq('plate_key', plateKey(plate))
          .limit(1);
        const known = (data ?? [])[0] as { vehicle_type: string; client_name: string | null } | undefined;
        if (known) {
          vehicleType = known.vehicle_type;
          clientName = clientName || known.client_name || '';
        }
      }
      // Client nommé : seulement un client déjà en base (un nouveau client a besoin de sa fiche complète)
      if (input.client) {
        const { data } = await db
          .from('clients')
          .select('name')
          .eq('name_key', plateKey(input.client))
          .limit(1);
        const found = (data ?? [])[0] as { name: string } | undefined;
        if (!found) {
          throw new Error(
            `client « ${input.client} » introuvable : ce n'est pas un client de l'atelier. Dis-le à la direction : ` +
              'un nouveau client se crée avec sa fiche complète depuis Rendez-vous, Nouveau rendez-vous.',
          );
        }
        clientName = found.name;
      }
      const tech = input.technicien ? await findTechnician(db, input.technicien) : null;
      const [h = 0, m = 0] = input.heure.split(':').map(Number);
      const end = input.duree_minutes ? h * 60 + m + input.duree_minutes : null;
      const endTime = end !== null && end < 24 * 60
        ? `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`
        : null;
      const who = [plate.toUpperCase(), clientName].filter(Boolean).join(', ');
      return propose(
        db,
        conversationId,
        'appointment',
        {
          client_name: clientName,
          plate,
          vehicle_type: vehicleType,
          date: input.date,
          start_time: input.heure,
          end_time: endTime,
          reason: input.motif,
          technician_id: tech?.id ?? null,
        },
        `Rendez-vous le ${frenchDay(input.date)} à ${hour(input.heure)} pour ${who} : ${input.motif}${
          tech ? `, avec ${tech.display_name}` : ''
        }`,
      );
    },
  }),
  action({
    name: 'preparer_travail_or',
    description:
      'Prépare l’ajout d’un travail à faire sur un OR (numéro de l’OR ou immatriculation du véhicule à l’atelier). Ne l’ajoute pas : la direction valide ensuite.',
    input_schema: schema(
      {
        numero_or: string('Numéro de l’OR (ex. 488 ou OR00488)'),
        immatriculation: string('Immatriculation, si le numéro n’est pas donné'),
        travail: string('Travail à faire, tel que dit'),
        heures: { type: 'number', minimum: 0.1, maximum: 100 },
      },
      ['travail'],
    ),
    input: z.object({
      numero_or: z.string().trim().max(20).optional(),
      immatriculation: z.string().trim().max(20).optional(),
      travail: text(),
      heures: z.number().min(0.1).max(100).optional(),
    }),
    run: async (db, input, conversationId) => {
      const order = await findOrder(db, input);
      return propose(
        db,
        conversationId,
        'ro_work',
        { repair_order_id: order.id, description: input.travail, estimated_hours: input.heures ?? null },
        `Ajouter « ${input.travail} »${
          input.heures ? ` (${String(input.heures).replace('.', ',')} h)` : ''
        } aux travaux de l’OR ${order.number}${order.plate ? ` (${order.plate})` : ''}`,
      );
    },
  }),
  action({
    name: 'preparer_assignation',
    description:
      'Prépare l’assignation d’un technicien à un OR (numéro de l’OR ou immatriculation). Ne l’assigne pas : la direction valide ensuite.',
    input_schema: schema(
      {
        numero_or: string('Numéro de l’OR (ex. 488 ou OR00488)'),
        immatriculation: string('Immatriculation, si le numéro n’est pas donné'),
        technicien: string('Prénom du technicien'),
      },
      ['technicien'],
    ),
    input: z.object({
      numero_or: z.string().trim().max(20).optional(),
      immatriculation: z.string().trim().max(20).optional(),
      technicien: text(60),
    }),
    run: async (db, input, conversationId) => {
      const [order, tech] = await Promise.all([findOrder(db, input), findTechnician(db, input.technicien)]);
      return propose(
        db,
        conversationId,
        'assign_technician',
        { repair_order_id: order.id, technician_id: tech.id },
        `Assigner ${tech.display_name} à l’OR ${order.number}${order.plate ? ` (${order.plate})` : ''}`,
      );
    },
  }),
];

/** Client de l'atelier reconnu par son nom (exact, sinon début unique du nom). */
async function findClient(db: Db, name: string): Promise<{ id: string; name: string; email: string | null }> {
  const key = plateKey(name);
  const { data, error } = await db
    .from('clients')
    .select('id, name, email, name_key')
    .like('name_key', `${key}%`)
    .limit(20);
  if (error) throw new Error(error.message);
  const list = (data ?? []) as { id: string; name: string; email: string | null; name_key: string }[];
  const exact = list.filter((client) => client.name_key === key);
  const match = exact.length ? exact : list;
  if (match.length !== 1) {
    throw new Error(
      match.length
        ? `plusieurs clients « ${name} » (${match.slice(0, 5).map((client) => client.name).join(', ')})`
        : `client « ${name} » introuvable`,
    );
  }
  return match[0]!;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/;

ACTION_TOOLS.push(
  action({
    name: 'preparer_mail',
    description:
      'Prépare un mail : à un client de l’atelier (e-mail de sa fiche) ou à une adresse dite. Pour une relance de paiement, donne les numéros des factures en retard relancées. Ne l’envoie pas : la direction relit le mail puis valide.',
    input_schema: schema(
      {
        client: string('Nom du client de l’atelier'),
        email: string('Adresse e-mail, si elle est dite ou si ce n’est pas un client'),
        objet: string('Objet du mail'),
        texte: string('Texte complet du mail, avec la formule de politesse et la signature'),
        factures: {
          type: 'array',
          items: { type: 'string' },
          description: 'Numéros des factures relancées (ex. F11887), pour une relance de paiement',
        },
      },
      ['objet', 'texte'],
    ),
    input: z
      .object({
        client: z.string().trim().max(120).optional(),
        email: z.string().trim().max(254).optional(),
        objet: text(200),
        texte: text(5000),
        factures: z.array(z.string().trim().min(1).max(20)).max(20).optional(),
      })
      .refine((value) => value.client || value.email, { message: 'indique le client ou l’adresse e-mail' }),
    run: async (db, input, conversationId) => {
      const client = input.client ? await findClient(db, input.client) : null;
      const to = (input.email || client?.email || '').trim().toLowerCase();
      if (!to) {
        throw new Error(`pas d’e-mail sur la fiche de ${client?.name ?? 'ce client'} : demande l’adresse`);
      }
      if (!EMAIL.test(to)) throw new Error(`adresse e-mail invalide : ${to}`);

      // Factures relancées : émises, encore dues, au client du mail
      const numbers = [...new Set((input.factures ?? []).map((value) => `F${value.replace(/\D/g, '')}`))];
      const invoices: { id: string; number: string }[] = [];
      if (numbers.length) {
        const { data, error } = await db
          .from('v_invoices_overview')
          .select('id, number, client_id, balance_due, status')
          .in('number', numbers);
        if (error) throw new Error(error.message);
        const found = (data ?? []) as {
          id: string;
          number: string;
          client_id: string;
          balance_due: number | null;
          status: string;
        }[];
        for (const number of numbers) {
          const invoice = found.find((item) => item.number === number);
          if (!invoice || invoice.status !== 'issued') throw new Error(`facture ${number} introuvable`);
          if (client && invoice.client_id !== client.id) {
            throw new Error(`la facture ${number} n’est pas à ${client.name}`);
          }
          if ((invoice.balance_due ?? 0) <= 0.01) throw new Error(`la facture ${number} est déjà réglée`);
          invoices.push({ id: invoice.id, number });
        }
      }
      const reminder = invoices.length > 0;
      const who = client ? `${client.name} (${to})` : to;
      return propose(
        db,
        conversationId,
        'send_mail',
        {
          to,
          client_id: client?.id ?? null,
          client_name: client?.name ?? null,
          subject: input.objet,
          text: input.texte,
          category: reminder ? 'billing' : 'workshop',
          invoice_ids: invoices.map((invoice) => invoice.id),
          invoice_numbers: invoices.map((invoice) => invoice.number),
        },
        `${reminder ? 'Relance' : 'Mail'} à ${who} : « ${input.objet} »${
          reminder ? `, factures ${invoices.map((invoice) => invoice.number).join(', ')}` : ''
        }`.slice(0, 500),
      );
    },
  }),
);

export const ACTION_DEFINITIONS = ACTION_TOOLS.map(({ name, description, input_schema }) => ({
  name,
  description,
  input_schema: input_schema as { type: 'object'; [key: string]: unknown },
}));

export const isActionTool = (name: string) => ACTION_TOOLS.some((tool) => tool.name === name);

/** Prépare l'action demandée ; une erreur devient un résultat lisible par l'assistant. */
export async function runAction(
  db: Db,
  name: string,
  input: unknown,
  conversationId: string | null,
): Promise<{ content: string; is_error: boolean; action?: ProposedAction }> {
  const found = ACTION_TOOLS.find((item) => item.name === name);
  if (!found) return { content: `Outil inconnu : ${name}`, is_error: true };
  const parsed = found.input.safeParse(input);
  if (!parsed.success) {
    return { content: `Paramètres invalides : ${parsed.error.issues[0]?.message ?? ''}`, is_error: true };
  }
  try {
    const proposed = await found.run(db, parsed.data as never, conversationId);
    return {
      content: JSON.stringify({
        action_preparee: proposed.summary,
        consigne:
          'Action affichée à la direction, pas encore faite : annonce-la et demande « Je le fais ? ».',
      }),
      is_error: false,
      action: proposed,
    };
  } catch (error) {
    return {
      content: `Action non préparée : ${error instanceof Error ? error.message : 'erreur'}`,
      is_error: true,
    };
  }
}
