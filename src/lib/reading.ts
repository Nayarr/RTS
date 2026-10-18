/** Lecture d'une photo (étiquette, contrôle technique, permis, carte grise) qui n'a rien donné. */
export const READING_FAILED = 'Lecture impossible : renseigne les informations à la main.';

/**
 * Message affiché quand la lecture échoue : toujours le même, pour que le technicien ou le bureau
 * sache qu'il doit saisir lui-même ; la cause (réseau, lecture non configurée…) est ajoutée en petit.
 */
export function readingFailedMessage(error: unknown) {
  const reason = error instanceof Error ? error.message.trim() : '';
  return reason && !reason.startsWith('Lecture impossible')
    ? `${READING_FAILED} (${reason})`
    : READING_FAILED;
}
