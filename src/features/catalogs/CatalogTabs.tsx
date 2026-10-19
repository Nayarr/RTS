import { SectionNav } from '@/components/SectionNav';
import { useProfile } from '@/features/auth/useProfile';

const LINKS = [
  { to: '/stock/consommables', label: 'Consommables', direction: true },
  { to: '/stock/pieces', label: 'Pièces', direction: true },
  { to: '/stock/pneumatiques', label: 'Pneumatiques', direction: false },
  { to: '/stock/forfaits', label: 'Forfaits', direction: true },
];

/**
 * Onglets des catalogues (une URL par onglet : lien direct depuis les alertes de stock).
 * La réception n'a que les pneumatiques : pas d'onglets.
 */
export function CatalogTabs() {
  const profile = useProfile();
  const links = LINKS.filter((link) => !link.direction || profile.data?.role !== 'reception');
  if (links.length < 2) return null;
  return <SectionNav label="Catalogues" links={links} />;
}
