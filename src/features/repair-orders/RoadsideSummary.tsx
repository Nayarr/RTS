import { MapPin } from 'lucide-react';
import { formatEuro } from '@/lib/numbers';
import { cn } from '@/lib/utils';
import type { RoadsideSummaryData } from './roadside';

/** Dépannage extérieur, en haut de ce que le client signe : lieu d'intervention et prix du déplacement. */
export function RoadsideSummary({
  roadside,
  className,
}: {
  roadside: RoadsideSummaryData;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Dépannage extérieur"
      className={cn('col gap-1.5 text-[14.5px] leading-snug', className)}
    >
      <p className="row items-start gap-2">
        <MapPin className="i s mt-0.5 shrink-0" />
        <span>
          <span className="muted">Lieu d’intervention :</span> <b>{roadside.address ?? '-'}</b>
        </span>
      </p>
      {roadside.price !== null && (
        <p className="row flex-wrap justify-between gap-x-4">
          <span>{roadside.label}</span>
          <b className="num whitespace-nowrap">{formatEuro(roadside.price)} HT</b>
        </p>
      )}
    </div>
  );
}
