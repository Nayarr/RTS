import { useEffect, useRef, useSyncExternalStore } from 'react';
import { onlineManager, useMutationState } from '@tanstack/react-query';
import { WifiOff } from 'lucide-react';
import { toast } from 'sonner';

const subscribe = (onChange: () => void) => onlineManager.subscribe(onChange);
const isOnline = () => onlineManager.isOnline();

/**
 * Bandeau « Hors connexion », comme dans l'ancienne appli. Sans réseau, les écrans
 * déjà consultés restent affichés et les modifications sont mises en attente : elles
 * partent toutes seules au retour du réseau (appli laissée ouverte).
 */
export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, isOnline);
  const pending = useMutationState({ filters: { predicate: (mutation) => mutation.state.isPaused } }).length;
  const wasOffline = useRef(!online);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      return;
    }
    if (wasOffline.current) {
      wasOffline.current = false;
      toast.success(
        pending ? 'Connexion rétablie : envoi des modifications en attente' : 'Connexion rétablie',
      );
    }
  }, [online, pending]);

  if (online) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-black shadow-lg"
    >
      <WifiOff className="size-4 shrink-0" />
      <span>
        Hors connexion : tu peux continuer, tout sera envoyé automatiquement au retour du réseau (garde
        l’appli ouverte).
        {pending > 0 && ` ${pending} modification${pending > 1 ? 's' : ''} en attente.`}
      </span>
    </div>
  );
}
