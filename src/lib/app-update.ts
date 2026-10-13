import { toast } from 'sonner';

/** Recherche d'une nouvelle version en ligne (appli restée ouverte des heures, borne). */
const CHECK_EVERY_MS = 5 * 60_000;
/** Page publique (lien client) : mise à jour seulement juste après l'ouverture, avant toute saisie. */
const PUBLIC_PAGE_GRACE_MS = 15_000;

let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null;
let updateReady = false;
let autoUpdate = false;

/** Écran sans saisie en cours à perdre : la borne se met à jour d'elle-même. */
export function setAutoUpdate(enabled: boolean) {
  autoUpdate = enabled;
  if (enabled) applyWhenQuiet();
}

const isPublicPage = () => /^\/(d|rdv)\//.test(location.pathname);
const dialogOpen = () => document.querySelector('[role="dialog"], [role="alertdialog"]') !== null;

/** Borne : mise à jour dès qu'aucune fenêtre (signature, sortie) n'est ouverte. */
function applyWhenQuiet() {
  if (!updateReady || !applyUpdate) return;
  if (dialogOpen()) {
    window.setTimeout(applyWhenQuiet, 30_000);
    return;
  }
  void applyUpdate(true);
}

function onNeedRefresh() {
  updateReady = true;
  // Lien client tout juste ouvert, borne : rechargé sans rien demander.
  if (isPublicPage() && performance.now() < PUBLIC_PAGE_GRACE_MS) {
    void applyUpdate?.(true);
    return;
  }
  if (autoUpdate) {
    applyWhenQuiet();
    return;
  }
  // Saisie peut-être en cours (même onglet en arrière-plan) : la mise à jour est seulement proposée.
  toast('Nouvelle version de l’appli disponible', {
    id: 'app-update',
    duration: Infinity,
    action: { label: 'Mettre à jour', onClick: () => void applyUpdate?.(true) },
  });
}

/**
 * Nouvelle version mise en ligne : appliquée sans attendre la prochaine ouverture (avant, un
 * téléphone ou une borne pouvait afficher l'ancienne version et ignorer un document récent).
 */
export async function initAppUpdates() {
  // Chargé seulement au démarrage de l'appli (pas dans les tests des écrans).
  const { registerSW } = await import('virtual:pwa-register');
  applyUpdate = registerSW({
    immediate: true,
    onNeedRefresh,
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      window.setInterval(() => {
        if (navigator.onLine) void registration.update().catch(() => {});
      }, CHECK_EVERY_MS);
    },
  });
}
