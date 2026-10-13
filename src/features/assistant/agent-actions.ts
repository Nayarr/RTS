/** Délai pendant lequel une action validée par la direction s'annule encore. */
export const UNDO_SECONDS = 5;

/** Réponse dictée qui valide l'action en attente (« vas-y », « oui », « valide », « fais-le »…). */
export const isGoAhead = (text: string) =>
  /^(vas[- ]?y|oui|ok|okay|d'?accord|valide|je valide|confirme|c'?est bon|fais[- ]le|go)(?![a-zà-ÿ])/i.test(
    text.trim().replace(/[’]/g, "'"),
  );
