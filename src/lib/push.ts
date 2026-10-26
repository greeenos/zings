import { pb } from '@/lib/db';

/**
 * Server push for reminders, so they arrive with Zings closed. Best effort:
 * without a service worker or PushManager (plain HTTP, older browsers) the
 * in-app reminders still work while Zings is open.
 */
function keyBytes(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4)), (c) => c.charCodeAt(0));
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  return navigator.serviceWorker.ready;
}

export async function enablePush(): Promise<boolean> {
  try {
    const reg = await registration();
    if (!reg) return false;
    const { publicKey } = await (await fetch(pb.buildURL('/api/push/key'))).json();
    const subscription =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
    const { endpoint, keys } = subscription.toJSON();
    await pb.collection('push_subscriptions').create({ owner: pb.authStore.record?.id, endpoint, keys });
    return true;
  } catch {
    return false;
  }
}

export async function disablePush(): Promise<void> {
  try {
    const subscription = await (await registration())?.pushManager.getSubscription();
    if (!subscription) return;
    const rows = await pb.collection('push_subscriptions').getFullList({
      filter: pb.filter('endpoint = {:endpoint}', { endpoint: subscription.endpoint }),
    });
    await Promise.all(rows.map((row) => pb.collection('push_subscriptions').delete(row.id)));
    await subscription.unsubscribe();
  } catch {
    /* already gone */
  }
}
