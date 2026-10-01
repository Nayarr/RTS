import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ROLE_LABELS, type AppRole } from '@/features/auth/roles';
import { ROLE_VALUES } from './schemas';

const ROLE_HINTS: Record<AppRole, string> = {
  direction: 'Accès complet, gestion de l’équipe',
  reception: 'OR, planning, devis, factures',
  technician: 'Ses OR, fiche de contrôle, badgeage',
  kiosk: 'Tablette de pointage / écran atelier',
};

interface RoleSelectProps {
  value: AppRole;
  onChange: (role: AppRole) => void;
}

export function RoleSelect({ value, onChange }: RoleSelectProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="role">Rôle</Label>
      <Select value={value} onValueChange={(role) => onChange(role as AppRole)}>
        <SelectTrigger id="role" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLE_VALUES.map((role) => (
            <SelectItem key={role} value={role}>
              <span className="font-medium">{ROLE_LABELS[role]}</span>
              <span className="text-muted-foreground"> — {ROLE_HINTS[role]}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
