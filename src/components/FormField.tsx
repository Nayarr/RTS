import type { ComponentProps } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface FormFieldProps extends ComponentProps<typeof Input> {
  id: string;
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
}

/** Champ de formulaire : libellé, saisie et message d'erreur accessibles. */
export function FormField({ id, label, error, hint, className, ...inputProps }: FormFieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className="field">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        className={className}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...inputProps}
      />
      {hint && !error && <span className="hint">{hint}</span>}
      {error && (
        <p id={errorId} className={cn('err')}>
          {error}
        </p>
      )}
    </div>
  );
}
