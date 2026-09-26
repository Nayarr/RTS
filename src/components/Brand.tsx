import { cn } from '@/lib/utils';

interface BrandProps {
  subtitle?: string;
  size?: 'sm' | 'lg';
  className?: string;
}

/** Logo RTS + nom de l'appli. */
export function Brand({ subtitle, size = 'sm', className }: BrandProps) {
  const large = size === 'lg';
  return (
    <div className={cn('flex items-center gap-3', large && 'flex-col text-center', className)}>
      <img
        src="/icons/icon-192.png"
        alt=""
        className={cn('rounded-md border bg-white p-0.5 shadow-sm', large ? 'size-16' : 'size-9')}
      />
      <div>
        <p className={cn('font-display leading-none font-bold', large ? 'text-3xl' : 'text-xl')}>
          RTS Atelier
        </p>
        {subtitle && (
          <p className="mt-1 text-xs tracking-wider text-muted-foreground uppercase">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
