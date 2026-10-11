import { SectionNav } from '@/components/SectionNav';

/** Onglets des catalogues (une URL par onglet : lien direct depuis les alertes de stock). */
export function CatalogTabs() {
  return (
    <SectionNav
      label="Catalogues"
      links={[
        { to: '/stock/consommables', label: 'Consommables' },
        { to: '/stock/pieces', label: 'Pièces' },
        { to: '/stock/forfaits', label: 'Forfaits' },
      ]}
    />
  );
}
