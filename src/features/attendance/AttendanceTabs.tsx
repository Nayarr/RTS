import { SectionNav } from '@/components/SectionNav';

/** Onglets de l'espace RH de la direction : pointages, congés, relevé d'heures. */
export function AttendanceTabs({ leaveRequests }: { leaveRequests?: number | undefined }) {
  return (
    <SectionNav
      label="Pointages et absences"
      links={[
        { to: '/pointages', label: 'Pointages' },
        { to: '/pointages/conges', label: 'Congés et absences', count: leaveRequests },
        { to: '/pointages/releve', label: 'Relevé d’heures' },
      ]}
    />
  );
}
