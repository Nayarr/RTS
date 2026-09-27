import { useEffect } from 'react';

/**
 * Tablette en mode borne (comme l'ancienne appli) : plein écran et écran toujours allumé
 * au premier toucher, pas de retour arrière ni de menu contextuel, rechargement vers 3 h.
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
      void wakeLock?.release().catch(() => {});
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);
}
