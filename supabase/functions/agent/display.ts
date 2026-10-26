// Affichage : l'assistant montre une liste à la direction sous forme de tableau (à copier ou à
// télécharger depuis la page). Rien n'est lu ni écrit dans la base : le tableau est gardé avec la
// réponse, dans l'historique de la conversation.
import { z } from 'zod';

export interface AgentTable {
  titre: string;
  colonnes: string[];
  lignes: string[][];
}

const cell = z.union([z.string(), z.number(), z.boolean(), z.null()]).transform((value) =>
  value === null ? '' : String(value).slice(0, 300)
);

const input = z
  .object({
    titre: z.string().trim().min(1).max(120),
    colonnes: z.array(z.string().trim().min(1).max(60)).min(1).max(10),
    lignes: z.array(z.array(cell).max(10)).min(1).max(300),
  })
  .refine((table) => table.lignes.every((row) => row.length === table.colonnes.length), {
    message: 'chaque ligne doit avoir autant de cases que de colonnes',
  });

export const DISPLAY_DEFINITIONS = [
  {
    name: 'afficher_tableau',
    description:
      'Montre une liste à la direction sous forme de tableau, à copier ou télécharger (CSV) depuis la page : véhicules à échéance, clients, factures… Les données viennent d’abord de tes outils de lecture. Ne recopie pas le tableau dans ta réponse : dis ce qu’il contient en une phrase.',
    input_schema: {
      type: 'object' as const,
      properties: {
        titre: {
          type: 'string',
          description: 'Titre court, ex. « Contrôles techniques d’ici fin novembre »',
        },
        colonnes: { type: 'array', items: { type: 'string' }, maxItems: 10 },
        lignes: {
          type: 'array',
          items: { type: 'array', items: { type: ['string', 'number', 'boolean', 'null'] } },
          maxItems: 300,
        },
      },
      required: ['titre', 'colonnes', 'lignes'],
      additionalProperties: false,
    },
  },
];

export const isDisplayTool = (name: string) => DISPLAY_DEFINITIONS.some((tool) => tool.name === name);

/** Tableau à afficher ; une erreur devient un résultat lisible par l'assistant. */
export function runDisplay(value: unknown): { content: string; is_error: boolean; table?: AgentTable } {
  const parsed = input.safeParse(value);
  if (!parsed.success) {
    return { content: `Tableau non affiché : ${parsed.error.issues[0]?.message ?? ''}`, is_error: true };
  }
  return {
    content: JSON.stringify({
      tableau_affiche: `${parsed.data.titre} (${parsed.data.lignes.length} lignes)`,
      consigne: 'Tableau visible par la direction : ne le recopie pas, résume-le en une phrase.',
    }),
    is_error: false,
    table: parsed.data,
  };
}
