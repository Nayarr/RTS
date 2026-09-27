import type { FormEventHandler, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

/** Section de formulaire enregistrée d’un bloc (réglages, fiche OR…). */
export function SectionCard({
  id,
  title,
  description,
  onSubmit,
  dirty,
  pending,
  onCancel,
  children,
}: {
  id: string;
  title: string;
  description: ReactNode;
  onSubmit: FormEventHandler<HTMLFormElement>;
  dirty: boolean;
  pending: boolean;
  onCancel: () => void;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-xl font-bold">{title}</h2>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form id={id} onSubmit={onSubmit} noValidate className="space-y-5">
          {children}
        </form>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        {dirty && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            Annuler les modifications
          </Button>
        )}
        <Button type="submit" form={id} disabled={!dirty || pending}>
          {pending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </CardFooter>
    </Card>
  );
}
