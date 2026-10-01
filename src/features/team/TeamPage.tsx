import { useState, type CSSProperties } from 'react';
import { toast } from 'sonner';
import { KeyRound, MailCheck, MoreVertical, Pencil, Power, UserPlus } from 'lucide-react';
import { initials } from '@/app/nav';
import { PageHeader } from '@/app/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { requestPasswordReset } from '@/features/auth/api';
import { ROLE_LABELS } from '@/features/auth/roles';
import { useProfile } from '@/features/auth/useProfile';
import { setAccountActive } from './api';
import { CreateAccountDialog } from './CreateAccountDialog';
import { EditAccountDialog } from './EditAccountDialog';
import { useTeam, useTeamMutation } from './hooks';
import { PinDialog } from './PinDialog';
import { RestRotationCard } from './RestRotationCard';
import type { TeamMember } from './types';

const activeTechnician = (member: TeamMember) => (member.technician?.is_active ? member.technician : null);

const ROLE_BADGE: Record<TeamMember['role'], string> = {
  direction: 's-green',
  reception: 's-blue',
  technician: 's-grey',
  kiosk: 's-grey',
};

const ROLE_HINTS: { role: TeamMember['role']; hint: string }[] = [
  { role: 'direction', hint: 'Accès complet, gestion de l’équipe' },
  { role: 'reception', hint: 'OR, planning, devis, factures' },
  { role: 'technician', hint: 'Ses OR, fiche de contrôle, badgeage' },
  { role: 'kiosk', hint: 'Tablette de pointage / écran atelier' },
];

function RoleCell({ member }: { member: TeamMember }) {
  return (
    <span className="row wrap gap-1.5">
      <span className={`badge ${ROLE_BADGE[member.role]}`}>{ROLE_LABELS[member.role]}</span>
      {!member.is_active && <span className="tag">Désactivé</span>}
    </span>
  );
}

function PlanningCell({ member }: { member: TeamMember }) {
  const technician = activeTechnician(member);
  if (!technician) {
    return (
      <span className="muted">
        {member.role === 'direction' || member.role === 'reception' ? 'Hors planning' : '—'}
      </span>
    );
  }
  if (technician.exclude_from_planning) return <span className="muted">Hors planning</span>;
  return (
    <span className="who">
      <span className="tdot" style={{ '--c': technician.color ?? '#6B7280' } as CSSProperties} />
      {technician.display_name}
      {technician.rest_group && (
        <>
          <span className="muted">·</span>
          <span>Repos {technician.rest_group}</span>
        </>
      )}
    </span>
  );
}

function PinCell({ member }: { member: TeamMember }) {
  if (!activeTechnician(member)) return <span className="muted">—</span>;
  return member.pinSetAt ? (
    <span className="badge s-ok dot">PIN défini</span>
  ) : (
    <span className="badge s-warn">Sans PIN</span>
  );
}

interface MemberActionsProps {
  member: TeamMember;
  isSelf: boolean;
  onEdit: () => void;
  onPin: () => void;
  onToggleActive: () => void;
}

function MemberActions({ member, isSelf, onEdit, onPin, onToggleActive }: MemberActionsProps) {
  const sendReset = async () => {
    try {
      await requestPasswordReset(member.email);
      toast.success(`Lien de réinitialisation envoyé à ${member.email}`);
    } catch {
      toast.error('Envoi impossible');
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="ibtn sm ghost" aria-label={`Actions pour ${member.full_name}`}>
          <MoreVertical className="i s" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil /> Modifier
        </DropdownMenuItem>
        {activeTechnician(member) && (
          <DropdownMenuItem onSelect={onPin}>
            <KeyRound /> Code PIN de pointage
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => void sendReset()}>
          <MailCheck /> Envoyer un lien de mot de passe
        </DropdownMenuItem>
        {!isSelf && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant={member.is_active ? 'destructive' : 'default'}
              onSelect={onToggleActive}
            >
              <Power /> {member.is_active ? 'Désactiver le compte' : 'Réactiver le compte'}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Écran « Équipe » (direction) : comptes, rôles, fiches techniciens, codes PIN. */
export function TeamPage() {
  const { data: me } = useProfile();
  const team = useTeam();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [pinFor, setPinFor] = useState<TeamMember | null>(null);
  const [toggling, setToggling] = useState<TeamMember | null>(null);

  const toggleActive = useTeamMutation(
    ({ member }: { member: TeamMember }) => setAccountActive(member.id, !member.is_active),
    ({ member }) => (member.is_active ? `${member.full_name} désactivé` : `${member.full_name} réactivé`),
  );

  const members = team.data ?? [];
  const actionsFor = (member: TeamMember) => (
    <MemberActions
      member={member}
      isSelf={member.id === me?.id}
      onEdit={() => setEditing(member)}
      onPin={() => setPinFor(member)}
      onToggleActive={() => setToggling(member)}
    />
  );

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Équipe' }, { label: 'Comptes et rôles' }]}
        title="Équipe"
        actions={
          <>
            <span className="sub hidden md:inline">Comptes, rôles, techniciens et codes de pointage</span>
            <Button onClick={() => setCreating(true)}>
              <UserPlus /> Nouveau compte
            </Button>
          </>
        }
      />

      <div className="split grid-cols-1! lg:grid-cols-[minmax(0,1fr)_330px]!">
        <div className="col gap-3">
          {team.isPending && <p className="text-muted-foreground">Chargement…</p>}
          {team.isError && <p className="text-destructive">Impossible de charger l’équipe.</p>}
          {team.isSuccess && (
            <section data-slot="card" className="card tbl-wrap overflow-x-auto!" aria-label="Comptes">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>Rôle et état</th>
                    <th>Planning</th>
                    <th>Pointage</th>
                    <th className="w-14">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => {
                    const technician = activeTechnician(member);
                    return (
                      <tr key={member.id} className={member.is_active ? undefined : 'opacity-60'}>
                        <td>
                          <span className="who">
                            <span
                              className="av"
                              style={
                                {
                                  '--c':
                                    technician?.color ??
                                    (member.role === 'direction'
                                      ? '#137017'
                                      : member.role === 'reception'
                                        ? '#4750B5'
                                        : '#6B7280'),
                                } as CSSProperties
                              }
                            >
                              {initials(member.full_name)}
                            </span>
                            <span className="c2">
                              <b>{member.full_name}</b>
                              <span>{member.email}</span>
                            </span>
                          </span>
                        </td>
                        <td>
                          <RoleCell member={member} />
                        </td>
                        <td>
                          <PlanningCell member={member} />
                        </td>
                        <td>
                          <PinCell member={member} />
                        </td>
                        <td>{actionsFor(member)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}
        </div>

        <div className="col gap-5">
          <RestRotationCard />
          <section data-slot="card" className="card" aria-labelledby="team-roles">
            <div className="card-h">
              <h2 className="h2" id="team-roles">
                Rôles
              </h2>
            </div>
            <ul>
              {ROLE_HINTS.map(({ role, hint }) => (
                <li key={role} className="li">
                  <span className={`badge ${ROLE_BADGE[role]}`}>{ROLE_LABELS[role]}</span>
                  <span className="hint text-right">{hint}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <CreateAccountDialog open={creating} onOpenChange={setCreating} />
      <EditAccountDialog member={editing} onOpenChange={(open) => !open && setEditing(null)} />
      <PinDialog member={pinFor} onOpenChange={(open) => !open && setPinFor(null)} />
      <ConfirmDialog
        open={toggling !== null}
        onOpenChange={(open) => !open && setToggling(null)}
        title={toggling?.is_active ? 'Désactiver le compte ?' : 'Réactiver le compte ?'}
        description={
          toggling?.is_active
            ? `${toggling.full_name} ne pourra plus se connecter. Son historique (OR, pointages) est conservé.`
            : `${toggling?.full_name ?? ''} pourra de nouveau se connecter.`
        }
        confirmLabel={toggling?.is_active ? 'Désactiver' : 'Réactiver'}
        destructive={toggling?.is_active}
        pending={toggleActive.isPending}
        onConfirm={() =>
          toggling && toggleActive.mutate({ member: toggling }, { onSuccess: () => setToggling(null) })
        }
      />
    </>
  );
}
