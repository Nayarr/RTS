/** Questions proposées tant que la conversation est vide. */
export const SUGGESTIONS = [
  'Combien on a facturé ce mois-ci ?',
  'Qui nous doit de l’argent ?',
  'Comment se présente la semaine ?',
  'Quels contrôles arrivent à échéance ?',
];

/** Nom lisible des lectures faites par l'assistant (outils de l'Edge Function « agent »). */
const TOOL_LABELS: Record<string, string> = {
  tableau_de_bord: 'tableau de bord',
  chiffres_du_mois: 'chiffres du mois',
  evolution_mensuelle: 'évolution mensuelle',
  tresorerie: 'trésorerie',
  factures_impayees: 'factures impayées',
  atelier_aujourdhui: 'atelier du jour',
  charge_atelier: 'charge atelier',
  rendez_vous: 'rendez-vous',
  devis: 'devis',
  rentabilite: 'rentabilité',
  performance_techniciens: 'performance des techniciens',
  echeances_vehicules: 'échéances des véhicules',
  locations: 'locations',
  recherche: 'recherche',
  pieces_a_commander: 'pièces à commander',
  alertes: 'alertes',
};

/** « Sources : chiffres du mois, factures impayées » (rien si aucune lecture). */
export function sourcesLabel(tools: readonly string[]): string {
  const labels = tools.map((tool) => TOOL_LABELS[tool] ?? tool.replaceAll('_', ' '));
  return labels.length ? `Sources : ${labels.join(', ')}` : '';
}
