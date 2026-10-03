import { ClipboardCheck } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useProfile } from '@/features/auth/useProfile';

/**
 * Réservé à la direction : exige que le technicien renseigne tous les points OK / 50 % / HS de la
 * fiche de contrôle avant de terminer l'OR. Rien n'est affiché pour les autres comptes.
 */
export function InspectionRequiredToggle({
  id,
  checked,
  onCheckedChange,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const { data: profile } = useProfile();
  if (profile?.role !== 'direction') return null;
  return (
    <div className="row items-start gap-3 rounded-xl border px-3.5 py-3">
      <Switch id={id} className="mt-0.5" checked={checked} onCheckedChange={onCheckedChange} />
      <span className="col gap-0.5">
        <Label htmlFor={id} className="row gap-1.5 text-sm font-bold">
          <ClipboardCheck className="i s" /> Fiche de contrôle complète obligatoire
        </Label>
        <span className="hint">
          Le technicien devra renseigner tous les points OK / 50 % / HS avant de terminer l’OR. Réservé à la
          direction.
        </span>
      </span>
    </div>
  );
}
