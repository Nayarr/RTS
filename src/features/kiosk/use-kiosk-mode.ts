import { useEffect } from 'react';
import { setAutoUpdate } from '@/lib/app-update';
import { kioskPing } from './api';

/** Signal de présence envoyé au serveur. */
const PING_EVERY_MS = 30_000;

/**
 * Tablette en mode borne (comme l'ancienne appli) : plein écran et écran toujours allumé
 * au premier toucher, pas de retour arrière ni de menu contextuel, rechargement vers 3 h.
 * Elle signale sa présence au bureau et se met à jour seule dès qu'une version est en ligne.
 */
export function useKioskMode() {
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;

    const goFullscreen = () => {
      const root = document.documentElement;
      if (!document.fullscreenElement && root.requestFullscreen) root.requestFullscreen().catch(() => {});
      if ('wakeLock' in navigator && !wakeLock) {
        navigator.wakeLock
          .request('screen')
          .then((lock) => {
            wakeLock = lock;
            lock.addEventListener('release', () => (wakeLock = null));
          })
          .catch(() => {});
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        wakeLock = null;
        goFullscreen();
      }
    };
    const blockBack = () => history.pushState({ kiosk: true }, '', location.href);
    const preventDefault = (event: Event) => event.preventDefault();

    history.pushState({ kiosk: true }, '', location.href);
    window.addEventListener('popstate', blockBack);
    document.addEventListener('pointerdown', goFullscreen);
    document.addEventListener('visibilitychange', onVisible);
    document.addEventListener('contextmenu', preventDefault);
    setAutoUpdate(true);
    const ping = () => void kioskPing().catch(() => {});
    ping();
    const presence = window.setInterval(ping, PING_EVERY_MS);
    const nightly = window.setInterval(() => {
      const now = new Date();
      if (now.getHours() === 3 && now.getMinutes() < 5) location.reload();
    }, 4 * 60_000);

    return () => {
      window.removeEventListener('popstate', blockBack);
      document.removeEventListener('pointerdown', goFullscreen);
      document.removeEventListener('visibilitychange', onVisible);
      document.removeEventListener('contextmenu', preventDefault);
      window.clearInterval(nightly);
      window.clearInterval(presence);
      setAutoUpdate(false);
      void wakeLock?.release().catch(() => {});
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);
}
