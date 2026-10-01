import type { ReactNode } from 'react';
import { CircleCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void;
}

/** Confirmation d'une action sensible (remplace les confirm() natifs de l'ancienne appli). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = false,
  pending = false,
  onConfirm,
}: ConfirmDialogProps) {
  const Icon = destructive ? Trash2 : CircleCheck;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="pt-[22px] sm:max-w-[460px]">
        <div className="row items-start gap-3.5">
          <span
            className={cn(
              'kpi-ico shrink-0',
              destructive
                ? 'border-transparent! bg-[color-mix(in_srgb,var(--destructive)_12%,transparent)]! text-destructive!'
                : 'text-primary!',
            )}
          >
            <Icon className="i s" />
          </span>
          <div className="col min-w-0 gap-1">
            <DialogTitle className="font-sans text-[17px] leading-snug font-bold">{title}</DialogTitle>
            <DialogDescription className="text-[13.5px]!">{description}</DialogDescription>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button variant={destructive ? 'destructive' : 'default'} disabled={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
