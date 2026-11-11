import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { signOut } from '@/features/auth/api';
import { setTvMode } from '@/features/workshop-board/domain';
import { verifyExitCode } from './api';

/**
 * Sortie de la borne : code de sortie choisi par la direction, puis déconnexion ou écran télé
 * (`allowTv` : borne de badgeage seulement, la borne de signature n'a pas d'écran atelier).
 */
export function ExitDialog({ onClose, allowTv = true }: { onClose: () => void; allowTv?: boolean }) {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  /** « Quitter » : déconnexion ; « Écran atelier (télé) » : la borne devient la télé de l'atelier. */
  const submit = async (event: FormEvent, target: 'sign-out' | 'tv' = 'sign-out') => {
    event.preventDefault();
    setPending(true);
    try {
      if (await verifyExitCode(code)) {
        if (target === 'tv') {
          setTvMode(true);
          void navigate('/tele', { replace: true });
        } else {
          await signOut();
        }
        return;
      }
      setError('Code incorrect');
    } catch {
      setError('Vérification impossible : vérifie la connexion');
    }
    setPending(false);
    setCode('');
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Quitter la borne</DialogTitle>
          <DialogDescription>Code de sortie réservé à la direction.</DialogDescription>
        </DialogHeader>
        <form id="kiosk-exit" onSubmit={(event) => void submit(event)}>
          <FormField
            id="kiosk-exit-code"
            label="Code de sortie"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={code}
            error={error}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          {allowTv && (
            <Button
              variant="outline"
              disabled={pending || code.length < 4}
              onClick={(event) => void submit(event, 'tv')}
            >
              Écran atelier (télé)
            </Button>
          )}
          <Button type="submit" form="kiosk-exit" disabled={pending || code.length < 4}>
            Quitter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
