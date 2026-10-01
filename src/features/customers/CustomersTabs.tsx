import { SectionNav } from '@/components/SectionNav';

/** Onglets clients / véhicules / échéances / contrats d'entretien. */
export function CustomersTabs({ deadlines }: { deadlines?: number | undefined }) {
  return (
    <SectionNav
      label="Clients et véhicules"
      links={[
        { to: '/clients', label: 'Clients' },
        { to: '/vehicules', label: 'Véhicules' },
        { to: '/vehicules/echeances', label: 'Échéances', count: deadlines },
        { to: '/contrats', label: 'Contrats' },
      ]}
    />
  );
}
