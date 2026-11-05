/** Message d'une erreur : celles de la base ne sont pas des `Error`, mais portent aussi un message. */
export function errorMessage(error: unknown, fallback: string) {
  return error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : fallback;
}
