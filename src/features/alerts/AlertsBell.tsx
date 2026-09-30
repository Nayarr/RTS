import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Bell } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Alertes</DialogTitle>
            <DialogDescription>Mises à jour automatiquement toutes les 5 minutes.</DialogDescription>
          </DialogHeader>
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune alerte.</p>
          ) : (
            <ul className="space-y-2">
              {list.map((notification) => {
                const isNew = openedUnread?.has(notification.id) ?? false;
                const content = (
                  <>
                    <span className="flex items-start justify-between gap-2">
                      <strong className="text-sm">{notification.title}</strong>
                      {isNew && <span className="shrink-0 text-xs font-semibold text-primary">Nouvelle</span>}
                    </span>
                    {notification.body && (
                      <span className="block text-sm text-muted-foreground">{notification.body}</span>
                    )}
                    <span className="block text-xs text-muted-foreground">
                      {formatDateTime(notification.created_at)}
                    </span>
                  </>
                );
                const className = cn(
                  'block w-full rounded-lg border p-3 text-left',
                  isNew ? 'border-primary bg-primary/5' : 'opacity-75',
                );
                return (
                  <li key={notification.id}>
                    {notification.link ? (
                      <button
                        type="button"
                        className={cn(className, 'transition hover:bg-muted')}
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
