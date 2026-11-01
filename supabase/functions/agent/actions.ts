// Actions que l'assistant de la direction peut PRÉPARER : rendez-vous (pris, déplacé ou annulé),
// travail à ajouter sur un OR, technicien à assigner, date prévue d'un OR, OR passé « Facture à
// faire », brouillon de facture, échéance d'un véhicule, mails (un seul, un par client à partir
// d'un modèle, ou un mail groupé au même texte pour tous les clients ou une partie ; envoyés par
// mail-send après validation, modifiables avant). Un outil ne fait que lire
// (vérifier l'OR, le véhicule, le technicien) puis noter l'action proposée dans agent_actions ; elle
// s'exécute seulement quand la direction la valide dans l'appli (execute_agent_action). Rien
// d'autre n'est écrit.
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
  kind:
    | 'appointment'
    | 'ro_work'
    | 'assign_technician'
    | 'send_mail'
    | 'send_mailing'
    | 'vehicle_deadline'
    | 'schedule_order'
    | 'appointment_change'
    | 'order_to_invoice'
    | 'invoice_draft';
  summary: string;
}

/** Une action préparée, ou plusieurs (mails groupés) avec ce qui n'a pas pu l'être. */
type Prepared = ProposedAction | { actions: ProposedAction[]; skipped: string[] };

interface ActionTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  input: z.ZodType;
  run: (db: Db, input: never, conversationId: string | null) => Promise<Prepared>;
}

const action = <S extends z.ZodType>(
  spec: Omit<ActionTool, 'input' | 'run'> & {
    input: S;
    run: (db: Db, input: z.infer<S>, conversationId: string | null) => Promise<Prepared>;
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

/** Véhicule de l'atelier par sa plaque. */
async function findVehicle(
  db: Db,
  plate: string,
): Promise<{ id: string; plate: string; client_name: string | null }> {
  const { data, error } = await db
    .from('v_vehicles_overview')
    .select('id, plate, client_name')
    .eq('plate_key', plateKey(plate))
    .limit(1);
  if (error) throw new Error(error.message);
  const vehicle = (data ?? [])[0] as { id: string; plate: string; client_name: string | null } | undefined;
  if (!vehicle) throw new Error(`véhicule ${plate} introuvable`);
  return vehicle;
}

/** « 2027-03-14 » → « mars 2027 » (contrôle hayon, au mois). */
const monthYear = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
const DEADLINES = {
  ct: { field: 'ct_due_date', label: 'Contrôle technique' },
  hayon: { field: 'tailgate_due_date', label: 'Contrôle hayon' },
  antipollution: { field: 'antipollution_due_date', label: 'Antipollution' },
} as const;
/** Échéance de l'agent → contrôle noté dans les relances (deadline_reminders.kind). */
const REMINDER_KINDS = { ct: 'ct', hayon: 'tailgate', antipollution: 'antipollution' } as const;
const ORDER_PROPERTIES = {
  numero_or: string('Numéro de l’OR (ex. 488 ou OR00488)'),
  immatriculation: string('Immatriculation, si le numéro n’est pas donné'),
};

interface Appointment {
  id: string;
  scheduled_date: string;
  start_time: string;
  plate: string | null;
  client_name: string | null;
}

ACTION_TOOLS.push(
  action({
    name: 'preparer_mails',
    description:
      'Prépare un mail par client à partir d’un modèle (contrôles à venir, relance commerciale…) : objet et texte avec {client} (nom du client) et {details} (ce qui le concerne : plaques, dates), puis la liste des clients avec leurs détails. Relance d’échéances : donne aussi, par client, les échéances relancées (relances) ; un véhicule déjà relancé depuis moins de 3 mois est refusé. Chaque mail part à l’e-mail de la fiche du client. Rien n’est envoyé : la direction les relit un par un, les modifie, les envoie ou les écarte.',
    input_schema: schema(
      {
        objet: string('Objet du mail, {client} possible'),
        texte: string('Texte complet avec {client} et {details}, formule de politesse et signature'),
        destinataires: {
          type: 'array',
          maxItems: 40,
          items: {
            type: 'object',
            properties: {
              client: string('Nom du client de l’atelier'),
              details: string(
                'Ce qui concerne ce client, ex. « AB-123-CD : contrôle technique le 12 novembre »',
              ),
              relances: {
                type: 'array',
                maxItems: 40,
                description: 'Relance d’échéances : chaque véhicule et contrôle cité dans les détails',
                items: {
                  type: 'object',
                  properties: {
                    immatriculation: string('Immatriculation du véhicule'),
                    echeance: { type: 'string', enum: ['ct', 'hayon', 'antipollution'] },
                  },
                  required: ['immatriculation', 'echeance'],
                  additionalProperties: false,
                },
              },
            },
            required: ['client'],
            additionalProperties: false,
          },
        },
      },
      ['objet', 'texte', 'destinataires'],
    ),
    input: z.object({
      objet: text(200),
      texte: text(5000),
      destinataires: z
        .array(
          z.object({
            client: text(120),
            details: z.string().trim().max(1000).optional(),
            relances: z
              .array(
                z.object({ immatriculation: text(20), echeance: z.enum(['ct', 'hayon', 'antipollution']) }),
              )
              .max(40)
              .default([]),
          }),
        )
        .min(1)
        .max(40),
    }),
    run: async (db, input, conversationId) => {
      const actions: ProposedAction[] = [];
      const skipped: string[] = [];
      const seen = new Set<string>();
      for (const recipient of input.destinataires) {
        try {
          const client = await findClient(db, recipient.client);
          if (seen.has(client.id)) continue;
          seen.add(client.id);
          const to = (client.email ?? '').trim().toLowerCase();
          if (!EMAIL.test(to)) throw new Error(`pas d’e-mail valable sur la fiche de ${client.name}`);
          // Échéances relancées : jamais deux fois en 3 mois (page Échéances, agent, rappels)
          const deadlines: { vehicle_id: string; kind: string }[] = [];
          for (const item of recipient.relances) {
            const vehicle = await findVehicle(db, item.immatriculation);
            const kind = REMINDER_KINDS[item.echeance];
            const { data: reminded, error } = await db.rpc('deadline_recently_reminded', {
              p_vehicle_id: vehicle.id,
              p_kind: kind,
            });
            if (error) throw new Error(error.message);
            if (reminded) {
              throw new Error(
                `${vehicle.plate} déjà relancé depuis moins de 3 mois (${
                  DEADLINES[item.echeance].label.toLowerCase()
                }) : retire-le du mail`,
              );
            }
            deadlines.push({ vehicle_id: vehicle.id, kind });
          }
          const fill = (value: string) =>
            value.replaceAll('{client}', client.name).replaceAll('{details}', recipient.details ?? '').trim();
          const subject = fill(input.objet).slice(0, 200);
          actions.push(
            await propose(
              db,
              conversationId,
              'send_mail',
              {
                to,
                client_id: client.id,
                client_name: client.name,
                subject,
                text: fill(input.texte).slice(0, 5000),
                category: 'workshop',
                invoice_ids: [],
                invoice_numbers: [],
                deadlines,
              },
              `Mail à ${client.name} (${to}) : « ${subject} »`.slice(0, 500),
            ),
          );
        } catch (error) {
          skipped.push(`${recipient.client} : ${error instanceof Error ? error.message : 'erreur'}`);
        }
      }
      if (actions.length === 0) throw new Error(`aucun mail préparé (${skipped.join(' ; ')})`);
      return { actions, skipped };
    },
  }),
  action({
    name: 'preparer_echeance',
    description:
      'Prépare la nouvelle date d’une échéance d’un véhicule : contrôle technique, contrôle hayon (au mois), antipollution. Ne la change pas : la direction valide ensuite.',
    input_schema: schema(
      {
        immatriculation: string('Immatriculation du véhicule'),
        echeance: { type: 'string', enum: ['ct', 'hayon', 'antipollution'] },
        date: string('Nouvelle date au format AAAA-MM-JJ (hayon : un jour du mois)'),
      },
      ['immatriculation', 'echeance', 'date'],
    ),
    input: z.object({
      immatriculation: text(20),
      echeance: z.enum(['ct', 'hayon', 'antipollution']),
      date: day,
    }),
    run: async (db, input, conversationId) => {
      const vehicle = await findVehicle(db, input.immatriculation);
      const deadline = DEADLINES[input.echeance];
      const when = input.echeance === 'hayon' ? monthYear(input.date) : `le ${frenchDay(input.date)}`;
      return propose(
        db,
        conversationId,
        'vehicle_deadline',
        { vehicle_id: vehicle.id, plate: vehicle.plate, field: deadline.field, date: input.date },
        `${deadline.label} de ${vehicle.plate}${
          vehicle.client_name ? ` (${vehicle.client_name})` : ''
        } : ${when}`,
      );
    },
  }),
  action({
    name: 'preparer_planification_or',
    description:
      'Prépare la date prévue d’un OR pas encore terminé (heures de début et de fin facultatives). Ne la change pas : la direction valide ensuite.',
    input_schema: schema(
      {
        ...ORDER_PROPERTIES,
        date: string('Jour prévu au format AAAA-MM-JJ'),
        heure_debut: string('Heure de début au format HH:MM, facultative'),
        heure_fin: string('Heure de fin au format HH:MM, facultative'),
      },
      ['date'],
    ),
    input: z
      .object({
        numero_or: z.string().trim().max(20).optional(),
        immatriculation: z.string().trim().max(20).optional(),
        date: day,
        heure_debut: time.optional(),
        heure_fin: time.optional(),
      })
      .refine((value) => !value.heure_fin || (value.heure_debut && value.heure_fin > value.heure_debut), {
        message: 'l’heure de fin suit l’heure de début',
      }),
    run: async (db, input, conversationId) => {
      if (input.date < parisToday()) throw new Error('date passée');
      const order = await findOrder(db, input);
      const hours = input.heure_debut
        ? ` à ${hour(input.heure_debut)}${input.heure_fin ? `, fin à ${hour(input.heure_fin)}` : ''}`
        : '';
      return propose(
        db,
        conversationId,
        'schedule_order',
        {
          repair_order_id: order.id,
          date: input.date,
          start_time: input.heure_debut ?? null,
          end_time: input.heure_fin ?? null,
        },
        `OR ${order.number}${order.plate ? ` (${order.plate})` : ''} prévu le ${
          frenchDay(input.date)
        }${hours}`,
      );
    },
  }),
  action({
    name: 'preparer_changement_rendez_vous',
    description:
      'Prépare le déplacement ou l’annulation d’un rendez-vous à venir, trouvé par la plaque ou le client (et sa date s’il y en a plusieurs). Ne le change pas : la direction valide ensuite.',
    input_schema: schema({
      immatriculation: string('Immatriculation du véhicule du rendez-vous'),
      client: string('Nom du client, si la plaque n’est pas donnée'),
      date_actuelle: string('Date actuelle du rendez-vous (AAAA-MM-JJ), s’il y en a plusieurs'),
      annuler: { type: 'boolean', description: 'Annuler le rendez-vous au lieu de le déplacer' },
      nouvelle_date: string('Nouvelle date au format AAAA-MM-JJ'),
      nouvelle_heure: string('Nouvelle heure de début au format HH:MM'),
      nouvelle_heure_fin: string('Nouvelle heure de fin au format HH:MM, facultative'),
    }),
    input: z
      .object({
        immatriculation: z.string().trim().max(20).optional(),
        client: z.string().trim().max(120).optional(),
        date_actuelle: day.optional(),
        annuler: z.boolean().default(false),
        nouvelle_date: day.optional(),
        nouvelle_heure: time.optional(),
        nouvelle_heure_fin: time.optional(),
      })
      .refine((value) => value.immatriculation || value.client, {
        message: 'indique l’immatriculation ou le client',
      })
      .refine((value) => value.annuler || value.nouvelle_date || value.nouvelle_heure, {
        message: 'indique la nouvelle date ou la nouvelle heure, ou annuler',
      }),
    run: async (db, input, conversationId) => {
      if (input.nouvelle_date && input.nouvelle_date < parisToday()) throw new Error('nouvelle date passée');
      let query = db
        .from('v_appointments_overview')
        .select('id, scheduled_date, start_time, plate, client_name')
        .in('status', ['planned', 'requested'])
        .gte('scheduled_date', input.date_actuelle ?? parisToday());
      if (input.date_actuelle) query = query.eq('scheduled_date', input.date_actuelle);
      if (input.immatriculation) {
        query = query.eq('vehicle_id', (await findVehicle(db, input.immatriculation)).id);
      } else if (input.client) {
        query = query.eq('client_id', (await findClient(db, input.client)).id);
      }
      const { data, error } = await query.order('scheduled_date').order('start_time').limit(5);
      if (error) throw new Error(error.message);
      const found = (data ?? []) as Appointment[];
      const appt = found[0];
      if (!appt) throw new Error('aucun rendez-vous à venir trouvé');
      if (found.length > 1 && !input.date_actuelle) {
        throw new Error(
          `plusieurs rendez-vous (${
            found.map((item) => `${frenchDay(item.scheduled_date)} à ${hour(item.start_time)}`).join(', ')
          }) : précise la date`,
        );
      }
      const who = [appt.plate, appt.client_name].filter(Boolean).join(', ');
      const current = `${frenchDay(appt.scheduled_date)} à ${hour(appt.start_time)}`;
      if (input.annuler) {
        return propose(
          db,
          conversationId,
          'appointment_change',
          { appointment_id: appt.id, cancel: true },
          `Annuler le rendez-vous du ${current} (${who})`,
        );
      }
      const date = input.nouvelle_date ?? appt.scheduled_date;
      const start = input.nouvelle_heure ?? appt.start_time.slice(0, 5);
      return propose(
        db,
        conversationId,
        'appointment_change',
        {
          appointment_id: appt.id,
          date,
          start_time: start,
          ...(input.nouvelle_heure ? { end_time: input.nouvelle_heure_fin ?? null } : {}),
        },
        `Déplacer le rendez-vous du ${current} (${who}) au ${frenchDay(date)} à ${hour(start)}`,
      );
    },
  }),
  action({
    name: 'preparer_or_facture_a_faire',
    description:
      'Prépare le passage d’un OR « Terminé atelier » en « Facture à faire » (OR validé par le bureau). Ne le change pas : la direction valide ensuite.',
    input_schema: schema(ORDER_PROPERTIES),
    input: z.object({
      numero_or: z.string().trim().max(20).optional(),
      immatriculation: z.string().trim().max(20).optional(),
    }),
    run: async (db, input, conversationId) => {
      const order = await findOrder(db, input);
      if (order.status !== 'work_done') throw new Error(`l’OR ${order.number} n’est pas « Terminé atelier »`);
      return propose(
        db,
        conversationId,
        'order_to_invoice',
        { repair_order_id: order.id },
        `Passer l’OR ${order.number}${order.plate ? ` (${order.plate})` : ''} en « Facture à faire »`,
      );
    },
  }),
  action({
    name: 'preparer_brouillon_facture',
    description:
      'Prépare le brouillon de facture d’un OR terminé, ou d’une facture groupée de plusieurs OR du même client. Le brouillon n’est jamais émis par toi : la direction le vérifie et l’émet dans l’appli.',
    input_schema: schema(
      {
        numeros_or: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 10,
          description: 'Numéros des OR (ex. 488 ou OR00488)',
        },
      },
      ['numeros_or'],
    ),
    input: z.object({ numeros_or: z.array(z.string().trim().min(1).max(20)).min(1).max(10) }),
    run: async (db, input, conversationId) => {
      const numbers = [...new Set(input.numeros_or.map((value) => docNumber('OR', value)))];
      const { data, error } = await db
        .from('v_repair_orders_overview')
        .select('id, number, plate, status, client_id, client_name')
        .in('number', numbers);
      if (error) throw new Error(error.message);
      const found = (data ?? []) as {
        id: string;
        number: string;
        plate: string | null;
        status: string;
        client_id: string | null;
        client_name: string | null;
      }[];
      const orders = numbers.map((number) => {
        const order = found.find((item) => item.number === number);
        if (!order) throw new Error(`OR ${number} introuvable`);
        if (order.status === 'invoiced') throw new Error(`l’OR ${number} est déjà facturé`);
        if (!['work_done', 'to_invoice'].includes(order.status)) {
          throw new Error(`l’OR ${number} n’est pas terminé`);
        }
        return order;
      });
      if (new Set(orders.map((order) => order.client_id)).size > 1) {
        throw new Error('les OR d’une facture groupée doivent être au même client');
      }
      const list = orders.map((order) => `${order.number}${order.plate ? ` (${order.plate})` : ''}`).join(
        ', ',
      );
      return propose(
        db,
        conversationId,
        'invoice_draft',
        { repair_order_ids: orders.map((order) => order.id) },
        `Brouillon de facture${orders.length > 1 ? ' groupée' : ''} pour ${list}${
          orders[0]?.client_name ? `, ${orders[0].client_name}` : ''
        }`.slice(0, 500),
      );
    },
  }),
);

/** Mails d'un envoi groupé : au plus la limite d'envoi de 24 h (mail-send). */
export const MAILING_MAX = 300;
const PAGE = 1000;

/** Toutes les lignes d'une lecture (par pages de 1 000). */
async function allRows<T>(
  read: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
) {
  const rows: T[] = [];
  for (let from = 0;; from += PAGE) {
    const { data, error } = await read(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

const VEHICLE_TYPES = ['pl', 'vul', 'remorque'] as const;

ACTION_TOOLS.push(
  action({
    name: 'preparer_envoi_groupe',
    description:
      'Prépare un mail groupé au même texte (annonce, info commerciale : matériel à vendre, fermeture, nouveau service…) pour tous les clients ou une partie : tous (tous: true), ou filtrés par type de client (pro ou particulier), type de véhicule (clients qui ont au moins un PL, VUL ou remorque), clients venus à l’atelier depuis N mois, ou une liste de noms. Un mail part à chaque client (son adresse seule, jamais les autres en copie), {client} est remplacé par son nom. Clients sans e-mail valable écartés et comptés. Rien n’est envoyé : la direction relit le texte et la liste des destinataires, en retire si besoin, puis envoie. Pour un mail différent par client (échéances, relances), utilise preparer_mails.',
    input_schema: schema(
      {
        objet: string('Objet du mail, {client} possible'),
        texte: string('Texte complet (formule de politesse et signature), {client} possible'),
        tous: { type: 'boolean', description: 'Tous les clients qui ont un e-mail' },
        type_client: { type: 'string', enum: ['pro', 'particulier'] },
        types_vehicule: {
          type: 'array',
          items: { type: 'string', enum: [...VEHICLE_TYPES] },
          description: 'Clients qui ont au moins un véhicule de ces types',
        },
        venus_depuis_mois: {
          type: 'integer',
          minimum: 1,
          maximum: 60,
          description: 'Clients avec un OR créé depuis N mois',
        },
        clients: { type: 'array', maxItems: 100, items: string('Nom du client') },
      },
      ['objet', 'texte'],
    ),
    input: z.object({
      objet: text(200),
      texte: text(5000),
      tous: z.boolean().optional(),
      type_client: z.enum(['pro', 'particulier']).optional(),
      types_vehicule: z.array(z.enum(VEHICLE_TYPES)).max(3).optional(),
      venus_depuis_mois: z.number().int().min(1).max(60).optional(),
      clients: z.array(text(120)).max(100).optional(),
    }),
    run: async (db, input, conversationId) => {
      const filtered = Boolean(
        input.type_client || input.types_vehicule?.length || input.venus_depuis_mois || input.clients?.length,
      );
      if (!input.tous && !filtered) {
        throw new Error(
          'précise les destinataires : tous les clients, ou un filtre (type, véhicules, venus depuis, noms)',
        );
      }
      type Client = {
        id: string;
        name: string;
        email: string | null;
        kind: string | null;
        archived_at: string | null;
      };
      let list = (
        await allRows<Client>((from, to) =>
          db.from('clients').select('id, name, email, kind, archived_at').is('archived_at', null).order(
            'name',
          )
            .range(from, to)
        )
      ).filter((client) => !client.archived_at);
      if (input.clients?.length) {
        const named = new Set<string>();
        for (const name of input.clients) named.add((await findClient(db, name)).id);
        list = list.filter((client) => named.has(client.id));
      }
      if (input.type_client) {
        const kind = input.type_client === 'pro' ? 'pro' : 'individual';
        list = list.filter((client) => (client.kind ?? 'pro') === kind);
      }
      const types = input.types_vehicule ?? [];
      if (types.length) {
        const owners = new Set(
          (
            await allRows<{ client_id: string | null; vehicle_type: string }>((from, to) =>
              db.from('vehicles').select('client_id, vehicle_type').in('vehicle_type', types).range(from, to)
            )
          )
            .filter((vehicle) => (types as string[]).includes(vehicle.vehicle_type))
            .map((vehicle) => vehicle.client_id),
        );
        list = list.filter((client) => owners.has(client.id));
      }
      if (input.venus_depuis_mois) {
        const since = new Date();
        since.setMonth(since.getMonth() - input.venus_depuis_mois);
        const sinceIso = since.toISOString();
        const visitors = new Set(
          (
            await allRows<{ client_id: string | null; created_at: string }>((from, to) =>
              db.from('repair_orders').select('client_id, created_at').gte('created_at', sinceIso).range(
                from,
                to,
              )
            )
          )
            .filter((order) => order.created_at >= sinceIso)
            .map((order) => order.client_id),
        );
        list = list.filter((client) => visitors.has(client.id));
      }
      // Un mail par adresse (deux fiches avec la même adresse : un seul mail)
      const seen = new Set<string>();
      const recipients: { client_id: string; name: string; to: string }[] = [];
      let withoutEmail = 0;
      for (const client of list) {
        const to = (client.email ?? '').trim().toLowerCase();
        if (!EMAIL.test(to)) {
          withoutEmail += 1;
          continue;
        }
        if (seen.has(to)) continue;
        seen.add(to);
        recipients.push({ client_id: client.id, name: client.name, to });
      }
      if (recipients.length === 0) {
        throw new Error(
          `aucun client avec un e-mail valable${withoutEmail ? ` (${withoutEmail} sans e-mail)` : ''}`,
        );
      }
      if (recipients.length > MAILING_MAX) {
        throw new Error(
          `${recipients.length} clients : plus de ${MAILING_MAX} mails par jour, découpe l’envoi (par type de client ou de véhicule)`,
        );
      }
      const subject = input.objet.slice(0, 200);
      return propose(
        db,
        conversationId,
        'send_mailing',
        { subject, text: input.texte, category: 'workshop', recipients, without_email: withoutEmail },
        `Mail groupé à ${recipients.length} client${recipients.length > 1 ? 's' : ''} : « ${subject} »`.slice(
          0,
          500,
        ),
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

/** Seules écritures de la réception : préparer des mails, qu'elle relit et envoie elle-même. */
export const RECEPTION_ACTIONS: ReadonlySet<string> = new Set(['preparer_mail', 'preparer_mails']);

/** Prépare l'action demandée ; une erreur devient un résultat lisible par l'assistant. */
export async function runAction(
  db: Db,
  name: string,
  input: unknown,
  conversationId: string | null,
): Promise<{ content: string; is_error: boolean; actions: ProposedAction[] }> {
  const found = ACTION_TOOLS.find((item) => item.name === name);
  if (!found) return { content: `Outil inconnu : ${name}`, is_error: true, actions: [] };
  const parsed = found.input.safeParse(input);
  if (!parsed.success) {
    return {
      content: `Paramètres invalides : ${parsed.error.issues[0]?.message ?? ''}`,
      is_error: true,
      actions: [],
    };
  }
  try {
    const prepared = await found.run(db, parsed.data as never, conversationId);
    if ('actions' in prepared) {
      return {
        content: JSON.stringify({
          mails_prepares: prepared.actions.length,
          ...(prepared.skipped.length ? { non_prepares: prepared.skipped } : {}),
          consigne:
            'Mails affichés un par un à la direction, rien n’est parti : dis combien sont prêts (et ceux qui manquent) ; elle les relit, les modifie et les envoie.',
        }),
        is_error: false,
        actions: prepared.actions,
      };
    }
    if (prepared.kind === 'send_mailing') {
      return {
        content: JSON.stringify({
          envoi_groupe_prepare: prepared.summary,
          consigne:
            'Mail groupé affiché à la direction, rien n’est parti : dis à combien de clients il partira (et combien n’ont pas d’e-mail) ; elle relit le texte et la liste, puis l’envoie.',
        }),
        is_error: false,
        actions: [prepared],
      };
    }
    return {
      content: JSON.stringify({
        action_preparee: prepared.summary,
        consigne:
          'Action affichée à la direction, pas encore faite : annonce-la et demande « Je le fais ? ».',
      }),
      is_error: false,
      actions: [prepared],
    };
  } catch (error) {
    return {
      content: `Action non préparée : ${error instanceof Error ? error.message : 'erreur'}`,
      is_error: true,
      actions: [],
    };
  }
}
