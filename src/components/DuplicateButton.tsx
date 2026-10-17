import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

const errorMessage = (error: unknown) =>
  error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : 'Copie impossible : réessaie';

/** « Dupliquer » : crée la copie (brouillon) puis l'ouvre. */
export function DuplicateButton({
  label,
  duplicate,
  path,
  success,
}: {
  /** Nom accessible, ex. « Dupliquer le devis ». */
  label: string;
  duplicate: () => Promise<string>;
  /** Adresse de la copie à ouvrir. */
  path: (id: string) => string;
  success: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const copy = useMutation({
    mutationFn: duplicate,
    onSuccess: async (id) => {
      toast.success(success);
      await queryClient.invalidateQueries();
      await navigate(path(id));
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <Button variant="outline" aria-label={label} disabled={copy.isPending} onClick={() => copy.mutate()}>
      <Copy /> {copy.isPending ? 'Copie…' : 'Dupliquer'}
    </Button>
  );
}
