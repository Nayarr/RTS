/** Tâches d'un OR (« Tâche à faire ») : une par ligne, lignes vides ignorées. */
export function taskLines(requestedWork: string | null | undefined): string[] {
  return (requestedWork ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Tâches sur une seule ligne (listes, cartes, écran atelier). */
export function taskSummary(requestedWork: string | null | undefined): string {
  return taskLines(requestedWork).join(' · ');
}
