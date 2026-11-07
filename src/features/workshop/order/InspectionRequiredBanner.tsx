import { ClipboardCheck } from 'lucide-react';
import { inspectionMissingPoints, type InspectionData } from '@/features/repair-orders/inspection';
import { cn } from '@/lib/utils';

/**
 * Bandeau du technicien quand la direction exige la fiche de contrôle complète : en haut de l'OR,
 * sous la liste des tâches, avec le nombre de points OK / 50 % / HS qui restent à renseigner.
 */
export function InspectionRequiredBanner({
  inspection,
  vehicleType,
}: {
  inspection: InspectionData | null;
  vehicleType: 'pl' | 'vul' | 'remorque';
}) {
  const missing = inspectionMissingPoints(inspection, vehicleType);
  return (
    <p className={cn('alert', missing ? 's-warn' : 's-ok')} role="status">
      <ClipboardCheck className="i s shrink-0" />
      <span>
        {missing
          ? `Fiche complète exigée par la direction : ${missing} point${missing > 1 ? 's' : ''} OK / 50 % / HS à renseigner.`
          : 'Fiche complète exigée par la direction : tous les points sont renseignés.'}
      </span>
    </p>
  );
}
