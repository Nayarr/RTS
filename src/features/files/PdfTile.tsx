import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Vignette d'un PDF (pas d'aperçu image) : ouvre le document dans un nouvel onglet. */
export function PdfTile({
  url,
  label,
  className,
}: {
  url: string | undefined;
  label: string;
  className?: string;
}) {
  const content = (
    <>
      <FileText className="size-6" aria-hidden />
      <span className="text-xs font-semibold">PDF</span>
    </>
  );
  const classes = cn(
    'flex flex-col items-center justify-center gap-1 rounded-[7px] border bg-muted text-muted-foreground',
    className,
  );
  return url ? (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={classes}
      aria-label={`Ouvrir le PDF « ${label} »`}
    >
      {content}
    </a>
  ) : (
    <div className={classes} role="img" aria-label={`PDF « ${label} »`}>
      {content}
    </div>
  );
}
