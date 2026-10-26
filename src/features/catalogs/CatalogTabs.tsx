import { SectionNav } from '@/components/SectionNav';

const LINKS = [
  { to: '/stock/consommables', label: 'Consommables' },
  { to: '/stock/pieces', label: 'Pièces' },
  { to: '/stock/forfaits', label: 'Forfaits' },
];

/**
 * Onglets du stock de la direction (une URL par onglet : lien direct depuis les alertes de stock).
 * Les pneumatiques ont leur entrée du menu.
 */
export function CatalogTabs() {
  return <SectionNav label="Catalogues" links={LINKS} />;
}
