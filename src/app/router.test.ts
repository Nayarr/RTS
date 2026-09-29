import type { RouteObject } from 'react-router';
import { describe, expect, it } from 'vitest';
import { routes } from './router';

const lazyRoutes = (list: RouteObject[]): RouteObject[] =>
  list.flatMap((route) => [...(route.lazy ? [route] : []), ...lazyRoutes(route.children ?? [])]);

describe('écrans chargés à la demande', () => {
  it('chaque écran se charge et fournit son composant', async () => {
    const pages = lazyRoutes(routes);
    expect(pages.length).toBeGreaterThan(30);
    for (const route of pages) {
      const loaded = typeof route.lazy === 'function' ? await route.lazy() : null;
      expect(typeof loaded?.Component, route.path).toBe('function');
    }
  }, 30_000);
});
