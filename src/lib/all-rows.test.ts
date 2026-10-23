import { describe, expect, it, vi } from 'vitest';
import { fetchAllRows, PAGE_SIZE } from './all-rows';

const table = (count: number) => Array.from({ length: count }, (_, i) => i);

describe('liste complète par pages', () => {
  it('1560 lignes : deux pages de l’API, rien de coupé à 1000', async () => {
    const rows = table(1560);
    const page = vi.fn((from: number, to: number) =>
      Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
    );
    expect(await fetchAllRows(page)).toEqual(rows);
    expect(page.mock.calls).toEqual([
      [0, PAGE_SIZE - 1],
      [PAGE_SIZE, 2 * PAGE_SIZE - 1],
    ]);
  });

  it('page pleine puis page vide ; erreur remontée', async () => {
    const rows = table(PAGE_SIZE);
    const page = vi.fn((from: number, to: number) =>
      Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
    );
    expect(await fetchAllRows(page)).toHaveLength(PAGE_SIZE);
    expect(page).toHaveBeenCalledTimes(2);

    const failure = new Error('réseau');
    await expect(fetchAllRows(() => Promise.resolve({ data: null, error: failure }))).rejects.toBe(failure);
  });

  it('plafond respecté', async () => {
    const page = vi.fn((from: number, to: number) =>
      Promise.resolve({ data: table(to - from + 1), error: null }),
    );
    expect(await fetchAllRows(page, 2500)).toHaveLength(2500);
    expect(page).toHaveBeenLastCalledWith(2000, 2499);
  });
});
