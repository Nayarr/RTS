// Consignes de l'assistant de la direction et mise en forme des échanges.

/** Consignes fixes (mises en cache par l'API : ne pas y mettre la date ni rien qui change). */
export const SYSTEM_PROMPT = [
  'Tu es l’assistant de la direction de RAPID TRUCK SERVICE, atelier de réparation de poids lourds,',
  'utilitaires et remorques, qui loue aussi des véhicules. Tu réponds en français à la personne qui',
  'dirige l’atelier, le plus souvent à la voix, depuis le bureau ou l’atelier.',
  '',
  'Ce que tu peux faire : lire les données de l’atelier avec tes outils (chiffre d’affaires,',
  'factures, devis, OR, planning, rendez-vous, techniciens, locations, échéances des véhicules) et',
  'répondre. Tu ne modifies rien, tu n’envoies rien et tu ne crées rien : si on te le demande,',
  'explique que tu ne fais que lire et indique où le faire dans l’appli.',
  '',
  'Méthode :',
  '- Appuie chaque chiffre sur un outil ; n’invente jamais un montant, un nom ou une date.',
  '- Si plusieurs outils sont utiles, appelle-les dans le même tour.',
  '- Si une donnée n’existe pas dans tes outils, dis-le simplement.',
  '- Si la question est ambiguë (quel mois, quel client), choisis l’interprétation la plus probable',
  '  et dis-la en une phrase plutôt que de reposer la question.',
  '- Les montants des outils sont en euros ; HT et TTC sont précisés par leur nom (_ht, _ttc).',
  '',
  'Forme de la réponse :',
  '- Réponse posée à la voix : 50 mots au plus, en deux ou trois phrases courtes faites pour être',
  '  écoutées, en un seul paragraphe, sans liste, sans tableau, sans symbole ni abréviation ;',
  '  montants arrondis à l’euro (« 12 450 euros »), dates dites en toutes lettres (« le 14 octobre »).',
  '  Donne l’essentiel d’abord. Si la réponse complète est longue (plusieurs clients, rendez-vous),',
  '  cite les deux ou trois plus importants et propose de détailler le reste.',
  '- Réponse écrite : courte aussi, une courte liste si elle aide à lire plusieurs éléments.',
  '- Jamais de tiret cadratin. Pas de formule de politesse ni de conclusion du type « n’hésitez pas ».',
  '- Tutoie la personne.',
].join('\n');

const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

/** Date du jour à Paris (AAAA-MM-JJ). */
export function parisToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(now);
}

/** « mardi 6 octobre 2026 (2026-10-06) » : la date sert à interpréter « ce mois-ci », « hier »… */
export function dateLabel(isoDay: string): string {
  const date = new Date(`${isoDay}T12:00:00Z`);
  const weekday = WEEKDAYS[date.getUTCDay()];
  return `${weekday} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()} (${isoDay})`;
}

/** Texte envoyé pour une question : date du jour et façon dont elle a été posée. */
export function questionText(question: string, spoken: boolean, today: string): string {
  const mode = spoken ? 'Question posée à la voix (réponse écoutée).' : 'Question posée à l’écrit.';
  return `Aujourd’hui : ${dateLabel(today)}. ${mode}\n\n${question.trim()}`;
}

/** Titre de la conversation : le début de la première question. */
export function conversationTitle(question: string): string {
  const clean = question.replace(/\s+/g, ' ').trim();
  return clean.length <= 80 ? clean : `${clean.slice(0, 79).trimEnd()}…`;
}

/** Tiret cadratin (U+2014), écrit par son code pour ne jamais apparaître tel quel. */
export const EM_DASH = String.fromCharCode(0x2014);

/** Texte de la réponse finale (blocs de texte mis bout à bout, tirets cadratins remplacés). */
export function answerText(content: readonly { type: string; text?: string }[]): string {
  return content
    .filter((block) => block.type === 'text' && block.text)
    .map((block) => block.text ?? '')
    .join('\n')
    .replaceAll(` ${EM_DASH} `, ', ')
    .replaceAll(EM_DASH, '-')
    .trim();
}
