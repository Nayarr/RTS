// Point du jour de l'Agent Direction : lectures fixes faites d'un coup (mêmes outils que pour les
// questions, mêmes droits), puis un seul appel à Claude pour les résumer.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { dateLabel, EM_DASH } from './prompt.ts';
import { runTool } from './tools.ts';

/** Au-delà, une lecture est coupée : le point reste court et son coût borné. */
const MAX_SECTION_CHARS = 8_000;

export interface BriefingSection {
  tool: string;
  label: string;
  content: string;
}

/** Jour suivant (AAAA-MM-JJ). */
export function nextDay(isoDay: string): string {
  const date = new Date(`${isoDay}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** Lectures du point du jour, dans l'ordre où elles sont présentées à l'agent. */
export function briefingReads(today: string): { tool: string; label: string; input: unknown }[] {
  return [
    { tool: 'tableau_de_bord', label: 'Situation du moment', input: {} },
    { tool: 'atelier_aujourdhui', label: 'Atelier du jour', input: {} },
    {
      tool: 'rendez_vous',
      label: 'Rendez-vous d’aujourd’hui et de demain',
      input: { du: today, au: nextDay(today) },
    },
    {
      tool: 'factures_impayees',
      label: 'Factures en retard de paiement',
      input: { en_retard_seulement: true },
    },
    { tool: 'pieces_a_commander', label: 'Pièces à commander', input: { etat: 'a_commander' } },
    {
      tool: 'echeances_vehicules',
      label: 'Contrôles dépassés ou dans les 14 jours',
      input: { dans_les_jours: 14 },
    },
    { tool: 'locations', label: 'Locations en cours et à venir', input: { etat: 'en_cours_et_a_venir' } },
    { tool: 'chiffres_du_mois', label: 'Chiffres du mois en cours', input: { mois: today.slice(0, 7) } },
    { tool: 'alertes', label: 'Dernières alertes', input: {} },
    {
      tool: 'mails',
      label: 'Mails reçus pas encore traités (hors publicité et spam)',
      input: { a_traiter: true },
    },
  ];
}

/** Fait toutes les lectures en parallèle ; une lecture en échec est simplement laissée de côté. */
export async function gatherBriefing(db: SupabaseClient, today: string): Promise<BriefingSection[]> {
  const reads = briefingReads(today);
  const results = await Promise.all(reads.map((item) => runTool(db, item.tool, item.input)));
  return reads.flatMap((item, index) => {
    const result = results[index];
    if (!result || result.is_error) return [];
    const content = result.content.length > MAX_SECTION_CHARS
      ? `${result.content.slice(0, MAX_SECTION_CHARS)} (liste coupée)`
      : result.content;
    return [{ tool: item.tool, label: item.label, content }];
  });
}

const INSTRUCTIONS = [
  'Fais le point du jour pour la direction, à partir des lectures ci-dessous, faites à l’instant.',
  'Ce point s’affiche à l’ouverture de l’onglet Agent Direction et peut être écouté.',
  '',
  'Forme : 4 à 8 phrases, lues une par une à voix haute puis affichées numérotées.',
  '- Chaque phrase : une étiquette d’un ou deux mots (« Urgent », « Contrôles », « Paiements »,',
  '  « À valider », « Mails », « Atelier », « Ce mois-ci »…), un texte de 30 mots au plus, et',
  '  urgent à vrai seulement pour ce qui demande une action aujourd’hui.',
  '- Sans markdown, sans formule d’accueil ni conclusion. Montants arrondis à l’euro',
  '  (« 4 380 euros »), dates en toutes lettres (« le 14 octobre »).',
  '',
  'Contenu, dans cet ordre :',
  '1. Ce qui demande une action aujourd’hui : mails urgents (qui et quoi), gros retards de paiement,',
  '   pièces à commander qui bloquent un OR, contrôles dépassés, location en retard, congés à',
  '   valider, devis en attente.',
  '2. Les mails à traiter en une phrase : combien, dont combien d’urgents, et combien ont une',
  '   réponse préparée (reply_status ready) : « J’ai préparé deux réponses : je te les lis après le',
  '   point. » (seulement s’il y en a).',
  '3. La journée de l’atelier : nombre d’OR du jour, techniciens absents, rendez-vous.',
  '4. Un repère du mois : CA HT facturé à ce jour.',
  'Cite le client, la plaque ou le technicien quand ça aide à agir. Ne parle pas de ce qui est vide',
  'ou normal ; s’il n’y a rien d’urgent, dis-le en une phrase. N’invente rien : uniquement les',
  'lectures ci-dessous. Une lecture absente n’a pas pu être faite : n’en parle pas.',
].join('\n');

/** Demande envoyée à l'agent : consignes, date du jour et lectures. */
export function briefingRequest(today: string, sections: readonly BriefingSection[]): string {
  const reads = sections.length
    ? sections.map((section) => `## ${section.label} (${section.tool})\n${section.content}`).join('\n\n')
    : 'Aucune lecture n’a pu être faite.';
  return `${INSTRUCTIONS}\n\nAujourd’hui : ${dateLabel(today)}.\n\n# Lectures\n\n${reads}`;
}

export const briefingSchema = z.object({
  phrases: z
    .array(
      z.object({
        etiquette: z.string().trim().min(1).max(40),
        texte: z.string().trim().min(1).max(400),
        urgent: z.boolean(),
      }),
    )
    .min(1)
    .max(10),
});
export type BriefingPhrase = z.infer<typeof briefingSchema>['phrases'][number];

/** Schéma de la réponse imposé à l'API (sortie structurée). */
export const BRIEFING_JSON_SCHEMA = {
  type: 'object',
  properties: {
    phrases: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          etiquette: { type: 'string' },
          texte: { type: 'string' },
          urgent: { type: 'boolean' },
        },
        required: ['etiquette', 'texte', 'urgent'],
        additionalProperties: false,
      },
    },
  },
  required: ['phrases'],
  additionalProperties: false,
} as const;

const clean = (text: string) => text.replaceAll(` ${EM_DASH} `, ', ').replaceAll(EM_DASH, '-').trim();

/** Phrases du point lues et vérifiées ; null si la réponse ne respecte pas le format. */
export function parseBriefing(text: string): BriefingPhrase[] | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = briefingSchema.safeParse(value);
  if (!parsed.success) return null;
  return parsed.data.phrases.map((phrase) => ({
    etiquette: clean(phrase.etiquette),
    texte: clean(phrase.texte),
    urgent: phrase.urgent,
  }));
}

/** Texte du point (une phrase par ligne) : gardé pour l'historique et les anciens affichages. */
export const briefingText = (phrases: readonly BriefingPhrase[]) =>
  phrases.map((phrase) => phrase.texte).join('\n');
