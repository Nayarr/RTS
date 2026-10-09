// Point du jour de l'Agent Direction : lectures fixes faites d'un coup (mêmes outils que pour les
// questions, mêmes droits), puis un seul appel à Claude pour les résumer.
import type { SupabaseClient } from '@supabase/supabase-js';
import { dateLabel } from './prompt.ts';
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
  'Forme :',
  '- 4 à 7 phrases courtes, une par ligne, 120 mots au plus en tout ; sans titre, sans puce,',
  '  sans gras ni markdown, sans formule d’accueil ni conclusion.',
  '- Montants arrondis à l’euro (« 4 380 euros »), dates en toutes lettres (« le 14 octobre »).',
  '',
  'Contenu, dans cet ordre :',
  '1. Ce qui demande une action aujourd’hui : gros retards de paiement, pièces à commander qui',
  '   bloquent un OR, contrôles dépassés, location en retard, congés à valider, devis en attente.',
  '2. La journée de l’atelier : nombre d’OR du jour, techniciens absents, rendez-vous.',
  '3. Un repère du mois : CA HT facturé à ce jour.',
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
