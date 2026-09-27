import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useFileUrl } from './hooks';

/** Image stockée dans R2, affichée via une URL signée temporaire. */
export function StoredImage({
  fileId,
  alt,
  className,
}: {
  fileId: string | null | undefined;
  alt: string;
  className?: string;
}) {
  const { url, isPending, isError } = useFileUrl(fileId);
  const [broken, setBroken] = useState<string | null>(null);

  if (fileId && isPending) return <Skeleton className={className} aria-label="Chargement de l’image" />;

  if (!fileId || isError || !url || broken === url) {
    return (
      <div
        role="img"
        aria-label={`${alt} (indisponible)`}
        className={cn(
          'flex items-center justify-center rounded-md bg-muted text-muted-foreground',
          className,
        )}
      >
        <ImageOff className="size-6" />
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      onError={() => setBroken(url)}
      className={cn('rounded-md object-cover', className)}
    />
  );
}
