import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GROUPS, SECTION_ROLES } from '@/app/nav';
import { mustBeTechnician } from '@/features/team/schemas';
import { renderRoutes } from '@/test/render';
import { OfficeLink } from './OfficeLink';
import { canEditAttendance } from './roles';
import { useProfile } from './useProfile';

vi.mock('./useProfile', () => ({ useProfile: vi.fn() }));

const asRole = (role: string) =>
  vi.mocked(useProfile).mockReturnValue({ data: { role } } as unknown as ReturnType<typeof useProfile>);

/** Entrées du menu d'un rôle, comme les filtre la barre latérale. */
const menuOf = (role: 'accountant' | 'reception') =>
  GROUPS.filter((group) => (group.roles ?? SECTION_ROLES[group.section]).includes(role)).flatMap((group) =>
    group.items.filter((item) => !item.roles || item.roles.includes(role)).map((item) => item.to),
  );

describe('rôle comptable', () => {
  it('menu limité à la facturation, à la RH et aux statistiques financières', () => {
    expect(menuOf('accountant')).toEqual([
      '/devis',
      '/factures',
      '/factures/avoirs',
      '/pointages',
      '/pointages/conges',
      '/pointages/releve',
      '/pilotage/statistiques',
      '/pilotage/tresorerie',
      '/pilotage/rentabilite',
    ]);
  });

  it('la réception garde son menu, sans la RH', () => {
    const menu = menuOf('reception');
    expect(menu).toEqual(expect.arrayContaining(['/or', '/planning', '/devis', '/garanties']));
    expect(menu).not.toContain('/pointages');
    expect(menu).not.toContain('/pilotage/statistiques');
  });

  it('pointages et absences en lecture seule', () => {
    expect(canEditAttendance('accountant')).toBe(false);
    expect(canEditAttendance('direction')).toBe(true);
  });

  it('la fiche technicien est imposée : il badge', () => {
    expect(mustBeTechnician('accountant')).toBe(true);
    expect(mustBeTechnician('reception')).toBe(false);
  });

  it('lien vers un écran du bureau : simple texte pour lui, lien pour le bureau', () => {
    const page = (
      <OfficeLink to="/or/1" className="b" linkClassName="ul">
        OR-1
      </OfficeLink>
    );
    asRole('accountant');
    const { unmount } = renderRoutes([{ path: '/', element: page }]);
    expect(screen.getByText('OR-1').tagName).toBe('SPAN');
    expect(screen.queryByRole('link')).toBeNull();
    unmount();

    asRole('reception');
    renderRoutes([{ path: '/', element: page }]);
    expect(screen.getByRole('link', { name: 'OR-1' })).toHaveAttribute('href', '/or/1');
    expect(screen.getByRole('link', { name: 'OR-1' })).toHaveClass('b', 'ul');
  });
});
