import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoutes } from '@/test/render';
import { applicationServerKey, enablePush, forgetPushSubscription, pushSupport } from './push';
import { PushBanner } from './PushBanner';

const { rpc, remove } = vi.hoisted(() => ({ rpc: vi.fn(), remove: vi.fn() }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc,
    from: () => ({ delete: () => ({ eq: remove }) }),
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const subscription = {
  endpoint: 'https://push.example/abc',
  toJSON: () => ({
    endpoint: 'https://push.example/abc',
    keys: { p256dh: 'cle-p256dh', auth: 'secret-auth' },
  }),
  unsubscribe: vi.fn(() => Promise.resolve(true)),
};
const pushManager = { getSubscription: vi.fn(), subscribe: vi.fn() };

/** Navigateur compatible : service worker actif, notifications à l'état demandé. */
function browser(permission: NotificationPermission, userAgent = 'Mozilla/5.0 (Linux; Android 14)') {
  const requestPermission = vi.fn(() => Promise.resolve<NotificationPermission>('granted'));
  vi.stubGlobal('Notification', { permission, requestPermission });
  vi.stubGlobal('PushManager', class {});
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve({ pushManager }) },
  });
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
  return { requestPermission };
}

beforeEach(() => {
  rpc.mockResolvedValue({ data: null, error: null });
  remove.mockResolvedValue({ error: null });
  pushManager.getSubscription.mockResolvedValue(null);
  pushManager.subscribe.mockResolvedValue(subscription);
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('notifications push', () => {
  it('clé publique VAPID convertie pour le navigateur', () => {
    const key = applicationServerKey('BAEC_-8');
    expect(Array.from(key)).toEqual([4, 1, 2, 255, 239]);
  });

  it('compatibilité de l’appareil', () => {
    expect(pushSupport()).toBe('unsupported'); // jsdom : pas de service worker
    browser('default');
    expect(pushSupport()).toBe('available');
    browser('denied');
    expect(pushSupport()).toBe('denied');
    browser('default', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)');
    expect(pushSupport()).toBe('ios-install');
  });

  it('activation : abonnement enregistré pour le compte, puis notification d’essai', async () => {
    browser('default');
    await expect(enablePush()).resolves.toBe(true);
    expect(pushManager.subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    expect(rpc).toHaveBeenCalledWith('register_push_subscription', {
      p_endpoint: 'https://push.example/abc',
      p_p256dh: 'cle-p256dh',
      p_auth: 'secret-auth',
      p_user_agent: 'Mozilla/5.0 (Linux; Android 14)',
    });
    expect(rpc).toHaveBeenLastCalledWith('send_test_push');
  });

  it('autorisation refusée : rien n’est enregistré', async () => {
    browser('default').requestPermission.mockResolvedValue('denied');
    await expect(enablePush()).resolves.toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('déconnexion : abonnement de l’appareil retiré', async () => {
    browser('granted');
    pushManager.getSubscription.mockResolvedValue(subscription);
    await forgetPushSubscription();
    expect(remove).toHaveBeenCalledWith('endpoint', 'https://push.example/abc');
    expect(subscription.unsubscribe).toHaveBeenCalled();
  });
});

describe('invitation à activer les notifications', () => {
  const renderBanner = () => renderRoutes([{ path: '/', element: <PushBanner /> }]);

  it('proposée tant que l’appareil n’est pas abonné ; activation confirmée', async () => {
    browser('default');
    renderBanner();
    await userEvent.click(await screen.findByRole('button', { name: 'Activer les notifications' }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Notifications activées sur cet appareil'),
    );
  });

  it('masquée si déjà activées', async () => {
    browser('granted');
    pushManager.getSubscription.mockResolvedValue(subscription);
    renderBanner();
    await waitFor(() => expect(pushManager.getSubscription).toHaveBeenCalled());
    expect(screen.queryByRole('region', { name: 'Notifications de l’appareil' })).toBeNull();
  });

  it('« Plus tard » la masque pour 7 jours', async () => {
    browser('default');
    const { unmount } = renderBanner();
    await userEvent.click(await screen.findByRole('button', { name: 'Plus tard' }));
    expect(screen.queryByRole('region', { name: 'Notifications de l’appareil' })).toBeNull();
    unmount();
    renderBanner();
    expect(screen.queryByRole('region', { name: 'Notifications de l’appareil' })).toBeNull();
  });

  it('iPhone : explique comment installer l’appli d’abord', () => {
    browser('default', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)');
    renderBanner();
    expect(screen.getByRole('region', { name: 'Notifications de l’appareil' })).toHaveTextContent('Sur l’écran d’accueil');
    expect(screen.queryByRole('button', { name: 'Activer les notifications' })).toBeNull();
  });
});
