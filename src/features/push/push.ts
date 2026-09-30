import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';

/**
 * Notifications push sur l'appareil (Web Push standard) :
 *   - unsupported : navigateur sans notifications push, ou clé VAPID non configurée ;
 *   - ios-install : iPhone / iPad, appli pas encore installée sur l'écran d'accueil
 *                   (Safari n'autorise les notifications que pour une appli installée) ;
 *   - denied      : notifications refusées dans les réglages du navigateur ;
 *   - available   : activation possible.
 */
export type PushSupport = 'unsupported' | 'ios-install' | 'denied' | 'available';

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isInstalled = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function pushSupport(): PushSupport {
  if (!env.VITE_VAPID_PUBLIC_KEY) return 'unsupported';
  if (isIos() && !isInstalled()) return 'ios-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission === 'denied' ? 'denied' : 'available';
}

/** Clé publique VAPID (base64url) au format attendu par pushManager.subscribe. */
export function applicationServerKey(base64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64Url
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(base64Url.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

/** Service worker de l'appli ; null s'il n'est pas actif (mode développement). */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000));
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

/** Abonnement actuel de cet appareil (null si les notifications ne sont pas activées). */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'available' || Notification.permission !== 'granted') return null;
  return (await registration())?.pushManager.getSubscription() ?? null;
}

/**
 * Active les notifications sur cet appareil pour le compte connecté, puis envoie une
 * notification d'essai. Renvoie false si l'utilisateur refuse l'autorisation.
 */
export async function enablePush(): Promise<boolean> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  const reg = await registration();
  if (!reg) throw new Error('Service worker indisponible : recharge l’appli puis réessaie');
  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey(env.VITE_VAPID_PUBLIC_KEY ?? ''),
    }));

  const { keys } = subscription.toJSON();
  const { error } = await supabase.rpc('register_push_subscription', {
    p_endpoint: subscription.endpoint,
    p_p256dh: keys?.p256dh ?? '',
    p_auth: keys?.auth ?? '',
    p_user_agent: navigator.userAgent,
  });
  if (error) throw error;
  await supabase.rpc('send_test_push');
  return true;
}

/** À la déconnexion : l'appareil ne reçoit plus les notifications de ce compte. */
export async function forgetPushSubscription(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
  await subscription.unsubscribe();
}
