/**
 * Ne garde que les champs modifiés dans le formulaire : deux personnes qui enregistrent
 * en même temps des champs différents n'écrasent pas le travail de l'autre.
 */
export function pickDirty<T extends object>(values: T, dirty: Partial<Record<keyof T, unknown>> | undefined) {
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => Boolean(dirty?.[key as keyof T])),
  ) as Partial<T>;
}
