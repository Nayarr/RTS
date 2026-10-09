// Lecture du point du jour : phrases du point, puis pour chaque réponse préparée le résumé du mail,
// la réponse dictée ligne par ligne et la question d'envoi.
import type { AgentBriefing, BriefingPhrase, PreparedReply } from './api';

export type BriefingStep =
  | { kind: 'phrase'; index: number; text: string }
  | { kind: 'mail-intro'; replyId: string; text: string }
  | { kind: 'mail-line'; replyId: string; line: number; text: string }
  | { kind: 'mail-ask'; replyId: string; text: string };

/** Phrases du point ; un ancien point (texte seul) est découpé ligne par ligne. */
export function briefingPhrases(briefing: Pick<AgentBriefing, 'phrases' | 'text'>): BriefingPhrase[] {
  if (Array.isArray(briefing.phrases) && briefing.phrases.length) return briefing.phrases;
  return briefing.text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((texte) => ({ etiquette: '', texte, urgent: false }));
}

/** Lignes de la réponse préparée (paragraphes, formule, signature), lues une par une. */
export const replyLines = (body: string | null) =>
  (body ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

/** Nom dit à voix haute : le nom de l'expéditeur, sinon son adresse. */
export const senderName = (reply: Pick<PreparedReply, 'from_name' | 'from_address'>) =>
  reply.from_name || reply.from_address;

/** Réponses lues après le point : celles qui attendent encore une décision. */
export const repliesToRead = (replies: readonly PreparedReply[]) =>
  replies.filter((reply) => reply.reply_status === 'ready');

/** Étapes de lecture, dans l'ordre. */
export function briefingSteps(
  phrases: readonly BriefingPhrase[],
  replies: readonly PreparedReply[],
): BriefingStep[] {
  const steps: BriefingStep[] = phrases.map((phrase, index) => ({
    kind: 'phrase',
    index,
    text: phrase.texte,
  }));
  for (const reply of repliesToRead(replies)) {
    const name = senderName(reply);
    steps.push({
      kind: 'mail-intro',
      replyId: reply.id,
      text: `Mail de ${name}. ${reply.reply_request ?? reply.summary ?? ''} Voici la réponse préparée.`,
    });
    replyLines(reply.reply_body).forEach((text, line) =>
      steps.push({ kind: 'mail-line', replyId: reply.id, line, text }),
    );
    steps.push({ kind: 'mail-ask', replyId: reply.id, text: `Je l’envoie à ${name} ?` });
  }
  return steps;
}

/** Étape suivante après « phrase suivante » : la prochaine phrase, ou le mail suivant pendant un mail. */
export function skipTarget(steps: readonly BriefingStep[], index: number): number {
  const current = steps[index];
  if (!current || current.kind === 'phrase') return index + 1;
  const next = steps.findIndex((step, at) => at > index && step.kind === 'mail-intro');
  return next < 0 ? steps.length : next;
}

/** Première étape du mail suivant (après une décision sur le mail en cours). */
export function nextMail(steps: readonly BriefingStep[], index: number): number {
  const next = steps.findIndex((step, at) => at > index && step.kind === 'mail-intro');
  return next < 0 ? steps.length : next;
}

export type VoiceCommand = 'send' | 'edit' | 'later';

/**
 * Réponse dite à voix haute après « Je l'envoie ? ». Une négation l'emporte (« ne l'envoie pas »
 * veut dire plus tard) ; rien de reconnu : on attend un clic.
 */
export function voiceCommand(heard: string): VoiceCommand | null {
  const text = heard
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[’']/g, ' ');
  if (/\b(non|pas|plus tard|apres|attends?|passe|suivant|laisse)\b/.test(text)) return 'later';
  if (/\b(modifi\w*|corrig\w*|change\w*|retouch\w*)\b/.test(text)) return 'edit';
  if (/\b(envoie|envoies|envoyer|envoi|envoye|oui|vas y|ok|d accord|valide)\b/.test(text)) return 'send';
  return null;
}

/** Délai pour annuler un envoi décidé (à la voix ou au clic). */
export const SEND_DELAY_MS = 5_000;
/** Point écouté aujourd'hui sur cet appareil : il ne repart plus tout seul à l'ouverture. */
export const LISTENED_KEY = 'rts-point-du-jour-ecoute';

/** Jour de l'appareil (AAAA-MM-JJ). */
export const localDay = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function readListened(): { day: string; at: string } | null {
  try {
    const value = JSON.parse(localStorage.getItem(LISTENED_KEY) ?? 'null') as {
      day?: string;
      at?: string;
    } | null;
    return value?.day && value.at ? { day: value.day, at: value.at } : null;
  } catch {
    return null;
  }
}
export function saveListened(at: Date) {
  try {
    localStorage.setItem(LISTENED_KEY, JSON.stringify({ day: localDay(at), at: at.toISOString() }));
  } catch {
    // stockage indisponible (navigation privée) : le point repartira à la prochaine ouverture
  }
}
