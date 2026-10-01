import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Bell } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useProfile } from '@/features/auth/useProfile';
import { formatDateTime } from '@/features/repair-orders/constants';
import { cn } from '@/lib/utils';
import type { AppNotification } from './api';
import { useMarkNotificationsRead, useNotifications } from './hooks';

/** Cloche du bureau : alertes générées par le serveur (retards, stock bas, congés, devis…). */
export function AlertsBell() {
  const { data: profile } = useProfile();
  const notifications = useNotifications(Boolean(profile));
  const markRead = useMarkNotificationsRead(profile?.id);
  const navigate = useNavigate();
  /** Alertes non lues à l'ouverture : restent en évidence tant que la liste est ouverte. */
  const [openedUnread, setOpenedUnread] = useState<Set<string> | null>(null);

  const list = notifications.data ?? [];
  const unread = list.filter((notification) => !notification.read_at);

  const open = () => {
    const ids = unread.map((notification) => notification.id);
    setOpenedUnread(new Set(ids));
    if (ids.length) markRead.mutate(ids);
  };
  const follow = (notification: AppNotification) => {
    if (!notification.link) return;
    setOpenedUnread(null);
    void navigate(notification.link);
  };

  return (
    <>
      <button
        type="button"
        className="ibtn"
        aria-label={unread.length ? `Alertes (${unread.length} non lues)` : 'Alertes'}
        onClick={open}
      >
        <Bell className="i" />
        {unread.length > 0 && <span className="pip">{unread.length > 99 ? '99+' : unread.length}</span>}
      </button>
      <Dialog open={openedUnread !== null} onOpenChange={(value) => !value && setOpenedUnread(null)}>
        <DialogContent
          showCloseButton={false}
          className="top-16! right-3 left-auto! flex max-h-[min(560px,80dvh)] w-[min(400px,calc(100%-1.5rem))] translate-x-0! translate-y-0! flex-col gap-0! overflow-hidden rounded-[10px] p-0! *:px-0! sm:right-8"
        >
          <div className="row between gap-3 border-b px-4! py-3">
            <DialogTitle className="font-sans text-sm font-bold">Alertes</DialogTitle>
            <DialogDescription className="hint">Mises à jour toutes les 5 minutes.</DialogDescription>
          </div>
          {list.length === 0 ? (
            <p className="hint px-4! py-6 text-center">Aucune alerte.</p>
          ) : (
            <ul className="overflow-y-auto">
              {list.map((notification) => {
                const isNew = openedUnread?.has(notification.id) ?? false;
                const content = (
                  <>
                    <span className={cn('tdot mt-1.5 shrink-0', alertTone(notification.type))} />
                    <span className="col min-w-0 grow gap-0">
                      <b className="text-[13.5px]">{notification.title}</b>
                      {notification.body && <span className="hint">{notification.body}</span>}
                      <span className="hint">{formatDateTime(notification.created_at)}</span>
                    </span>
                    {isNew && <span className="badge s-blue h-[22px]! shrink-0 text-[11px]!">Nouvelle</span>}
                  </>
                );
                const className = cn(
                  'flex w-full gap-2.5 border-b px-4 py-3 text-left',
                  !isNew && 'opacity-75',
                );
                return (
                  <li key={notification.id} className="last:*:border-b-0">
                    {notification.link ? (
                      <button
                        type="button"
                        className={cn(className, 'cursor-pointer transition hover:bg-hover')}
                        onClick={() => follow(notification)}
                      >
                        {content}
                      </button>
                    ) : (
                      <div className={className}>{content}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Pastille de couleur selon le type d'alerte (retard / stock en rouge, bonne nouvelle en vert). */
function alertTone(type: string | null) {
  if (!type) return 's-warn';
  if (/overdue|late|retard|stock|refus|reject/.test(type)) return 's-bad';
  if (/accept|received|paid|approved/.test(type)) return 's-ok';
  return 's-warn';
}
