import { useState } from 'react';
import { toast } from 'sonner';
import { KeyRound, MailCheck, MoreHorizontal, Pencil, Power, UserPlus } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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

function StatusBadges({ member }: { member: TeamMember }) {
  const technician = activeTechnician(member);
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge variant={member.role === 'direction' ? 'default' : 'secondary'}>
        {ROLE_LABELS[member.role]}
      </Badge>
      {!member.is_active && <Badge variant="destructive">Désactivé</Badge>}
      {technician && !member.pinSetAt && (
        <Badge variant="outline" className="border-warning text-warning">
          Sans PIN
        </Badge>
      )}
      {technician?.exclude_from_planning && <Badge variant="outline">Hors planning</Badge>}
      {technician?.rest_group && <Badge variant="outline">Repos {technician.rest_group}</Badge>}
    </div>
  );
}

function TechnicianTag({ member }: { member: TeamMember }) {
  const technician = activeTechnician(member);
  if (!technician) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="size-3 rounded-full" style={{ backgroundColor: technician.color ?? '#6B7280' }} />
      {technician.display_name}
    </span>
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
        <Button variant="ghost" size="icon" aria-label={`Actions pour ${member.full_name}`}>
          <MoreHorizontal />
        </Button>
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Équipe</h1>
          <p className="text-muted-foreground">Comptes, rôles, techniciens et codes de pointage.</p>
        </div>
        <Button size="lg" onClick={() => setCreating(true)}>
          <UserPlus /> Nouveau compte
        </Button>
      </div>

      {team.isPending && <p className="text-muted-foreground">Chargement…</p>}
      {team.isError && <p className="text-destructive">Impossible de charger l’équipe.</p>}

      {team.isSuccess && (
        <>
          {/* Bureau : tableau */}
          <div className="hidden rounded-lg border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Planning</TableHead>
                  <TableHead>Rôle et état</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id} className={member.is_active ? undefined : 'opacity-60'}>
                    <TableCell>
                      <div className="font-medium">{member.full_name}</div>
                      <div className="text-sm text-muted-foreground">{member.email}</div>
                    </TableCell>
                    <TableCell>
                      <TechnicianTag member={member} />
                    </TableCell>
                    <TableCell>
                      <StatusBadges member={member} />
                    </TableCell>
                    <TableCell>{actionsFor(member)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Téléphone / tablette : cartes */}
          <ul className="space-y-3 md:hidden">
            {members.map((member) => (
              <li
                key={member.id}
                className={`rounded-lg border bg-card p-4 ${member.is_active ? '' : 'opacity-60'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{member.full_name}</div>
                    <div className="text-sm text-muted-foreground">{member.email}</div>
                  </div>
                  {actionsFor(member)}
                </div>
                <div className="mt-3 space-y-2 text-sm">
                  <TechnicianTag member={member} />
                  <StatusBadges member={member} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <RestRotationCard />

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
    </div>
  );
}
