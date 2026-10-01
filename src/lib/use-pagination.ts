import { useState } from 'react';

/** Découpe d'une liste en pages ; revient à la première page quand le filtre (`resetKey`) change. */
export function usePagination<T>(items: T[], pageSize: number, resetKey: string) {
  const [page, setPage] = useState(0);
  const [key, setKey] = useState(resetKey);
  if (key !== resetKey) {
    setKey(resetKey);
    setPage(0);
  }
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  return {
    page: current,
    pageCount,
    setPage,
    items: items.slice(current * pageSize, (current + 1) * pageSize),
    shown: Math.min(items.length, (current + 1) * pageSize),
    total: items.length,
  };
}
