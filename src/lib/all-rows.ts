/** Lignes renvoyées au plus par requête : max_rows de l'API Supabase (supabase/config.toml). */
export const PAGE_SIZE = 1000;

interface PageResult<T> {
  data: T[] | null;
  error: Error | null;
}

/**
 * Toutes les lignes d'une liste, par pages de 1000 : l'API n'en renvoie jamais plus en une fois.
 * La requête doit être triée sur une clé unique pour que les pages ne se chevauchent pas.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  max = 20_000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < max; from += PAGE_SIZE) {
    const { data, error } = await page(from, Math.min(from + PAGE_SIZE, max) - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}
