// Consignes de l'aide au diagnostic et mise en forme de la question (historique, documentation).

export const SYSTEM_PROMPT = [
  'Tu aides les mécaniciens de RAPID TRUCK SERVICE, atelier de réparation de poids lourds, utilitaires',
  'et remorques, à diagnostiquer une panne. Tu réponds en français, au mécanicien, en le tutoyant.',
  '',
  'Tu reçois l’historique du véhicule (passages à l’atelier, travaux, pièces, kilométrages, fiche de',
  'contrôle) et des extraits de la documentation technique de l’atelier, numérotés [1], [2]…',
  '',
  'Méthode :',
  '- Pars des symptômes décrits et de l’historique (pièce changée récemment, panne qui revient).',
  '- Propose les causes les plus probables d’abord, avec pour chacune le contrôle à faire pour la',
  '  confirmer ou l’écarter (mesure, valeur attendue, outil).',
  '- Appuie-toi sur les extraits de la documentation quand ils s’appliquent et cite-les par leur numéro ;',
  '  n’invente jamais une valeur constructeur : si elle n’est pas dans les extraits, dis de la vérifier',
  '  dans la documentation du constructeur.',
  '- Rappelle les consignes de sécurité utiles (circuit d’air sous pression, haute tension, levage).',
  '',
  'Forme : réponse courte et concrète, une liste de 3 à 5 pistes au plus, sans tiret cadratin,',
  'sans formule de politesse.',
].join('\n');

export interface KnowledgePassage {
  title: string;
  page: number;
  content: string;
}

/** Message du mécanicien : symptômes, historique du véhicule et extraits numérotés. */
export function diagnosticMessage(question: string, history: unknown, passages: KnowledgePassage[]): string {
  const sources = passages.length
    ? passages.map((passage, index) =>
      `[${index + 1}] ${passage.title}, page ${passage.page} :\n${passage.content}`
    )
      .join('\n\n')
    : 'Aucun extrait de la documentation technique ne correspond.';
  return [
    `Symptômes décrits par le mécanicien :\n${question}`,
    `Historique du véhicule (JSON) :\n${JSON.stringify(history)}`,
    `Extraits de la documentation technique :\n${sources}`,
  ].join('\n\n');
}

/** Mots utiles à la recherche dans la documentation : symptômes, marque et modèle du véhicule. */
export function searchQuery(question: string, history: unknown): string {
  const vehicle = (history as { vehicule?: { marque?: string | null; modele?: string | null } } | null)
    ?.vehicule;
  return [question, vehicle?.marque, vehicle?.modele].filter(Boolean).join(' ').slice(0, 500);
}
