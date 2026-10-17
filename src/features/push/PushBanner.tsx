import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { enablePush, pushSupport, requestNotificationPermission, resumePush } from './push';

const HIDDEN_KEY = 'rts_push_banner_hidden_until';
const HIDE_DAYS = 7;

const hiddenUntil = () => {
  try {
    return Number(localStorage.getItem(HIDDEN_KEY) ?? 0);
  } catch {
    return 0;
  }
};

/**
 * Invitation à activer les notifications sur cet appareil (téléphone de l'atelier,
 * poste du bureau). Masquée une fois activées, ou 7 jours avec « Plus tard ».
 */
export function PushBanner() {
  const queryClient = useQueryClient();
  const [support] = useState(pushSupport);
  const [hidden, setHidden] = useState(() => hiddenUntil() > Date.now());
  const subscription = useQuery({
    queryKey: ['push-subscription'],
    // Déjà autorisées sur l'appareil (après une déconnexion par exemple) : réabonné sans invitation
    queryFn: () => resumePush().catch(() => null),
    enabled: support === 'available' && !hidden,
    staleTime: Infinity,
  });
  const enable = useMutation({
    mutationFn: (permission: Promise<NotificationPermission>) => enablePush(permission),
    onSuccess: async (granted) => {
      if (!granted) {
        toast.error('Notifications refusées : autorise-les dans les réglages du navigateur');
        return;
      }
      toast.success('Notifications activées sur cet appareil');
      await queryClient.invalidateQueries({ queryKey: ['push-subscription'] });
    },
    onError: (error) =>
      toast.error(
        error instanceof Error && error.message.startsWith('Service worker')
          ? error.message
          : 'Activation impossible : réessaie dans un instant',
      ),
  });

  const later = () => {
    try {
      localStorage.setItem(HIDDEN_KEY, String(Date.now() + HIDE_DAYS * 86_400_000));
    } catch {
      // stockage indisponible (navigation privée) : masqué pour cette visite seulement
    }
    setHidden(true);
  };

  if (hidden || (support !== 'available' && support !== 'ios-install')) return null;
  if (support === 'available' && (subscription.isPending || subscription.data)) return null;

  return (
    <section aria-label="Notifications de l’appareil" className="alert s-blue flex-wrap">
      <Bell className="i" />
      <p className="grow">
        <b>Notifications de l’appareil</b>{' '}
        <span className="muted">
          {support === 'ios-install'
            ? ': pour être prévenu même téléphone verrouillé, installe d’abord l’appli : touche Partager puis « Sur l’écran d’accueil », et ouvre-la depuis la nouvelle icône.'
            : ': sois prévenu dès qu’une alerte demande une action (devis accepté, OR confié ou rouvert, congé demandé ou décidé…), même téléphone verrouillé.'}
        </span>
      </p>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={later}>
          Plus tard
        </Button>
        {support === 'available' && (
          <Button
            size="sm"
            aria-label="Activer les notifications"
            disabled={enable.isPending}
            onClick={() => enable.mutate(requestNotificationPermission())}
          >
            Activer
          </Button>
        )}
      </div>
    </section>
  );
}
