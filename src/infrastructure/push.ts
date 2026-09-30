import type { FriendlyGateway } from '../domain/gateway';

// Public web-app identifiers from friendly-social/web, not account credentials.
const config = {
  apiKey: 'AIzaSyCNiyRTYRCUC5RrDUevOHh1PIvs-E8m0E0',
  authDomain: 'friendly-e8071.firebaseapp.com',
  projectId: 'friendly-e8071',
  messagingSenderId: '665338758593',
  appId: '1:665338758593:web:9674acf4e970d01c921b40',
};
const vapidKey =
  'BAEj5IbZiBmuUHKNu1Z3hoM5OHEEETG63Lg7mcxxG-kX5t-r5minZEeZTFC-qlW5vYir7mSt3eruuZbr0WcORX0';
const scope = '/friendly-push/';

async function messaging() {
  const [app, sdk] = await Promise.all([import('firebase/app'), import('firebase/messaging')]);
  if (!(await sdk.isSupported()))
    throw new Error('This browser does not support push notifications.');
  const instance =
    app.getApps().find((a) => a.name === 'friendly-push') ??
    app.initializeApp(config, 'friendly-push');
  return { sdk, instance: sdk.getMessaging(instance) };
}

async function setWorkerEnabled(registration: ServiceWorkerRegistration, enabled: boolean) {
  const worker = registration.active ?? registration.installing ?? registration.waiting;
  if (!worker) throw new Error('Could not start notifications. Please try again.');
  if (worker.state !== 'activated')
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        worker.removeEventListener('statechange', changed);
        reject(new Error('The notification service did not respond. Please try again.'));
      }, 10_000);
      function changed() {
        if (worker!.state === 'activated') {
          clearTimeout(timer);
          worker!.removeEventListener('statechange', changed);
          resolve();
        }
      }
      worker.addEventListener('statechange', changed);
      changed();
    });
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      reject(new Error('Could not update notification settings.'));
    }, 5000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      channel.port1.close();
      if (event.data === 'ok') resolve();
      else reject(new Error('Could not save notification settings.'));
    };
    worker.postMessage({ type: 'friendly:enable', enabled }, [channel.port2]);
  });
}

export async function enablePush(gateway: FriendlyGateway, signal: AbortSignal) {
  if (!globalThis.isSecureContext || !('serviceWorker' in navigator) || !('Notification' in window))
    throw new Error('Push requires HTTPS and a browser that supports notifications.');
  const permission = await Notification.requestPermission();
  signal.throwIfAborted();
  if (permission !== 'granted')
    throw new Error('Allow notifications in your site settings and try again.');
  const { sdk, instance } = await messaging();
  signal.throwIfAborted();
  const registration = await navigator.serviceWorker.register('/friendly-push-sw.js', { scope });
  await setWorkerEnabled(registration, false);
  try {
    const token = await sdk.getToken(instance, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });
    signal.throwIfAborted();
    if (!token) throw new Error('Could not enable browser notifications. Please try again.');
    await gateway.registerPush(token, signal);
    signal.throwIfAborted();
    await setWorkerEnabled(registration, true);
    if (signal.aborted) {
      await setWorkerEnabled(registration, false);
      signal.throwIfAborted();
    }
  } catch (error) {
    await setWorkerEnabled(registration, false);
    throw error;
  }
}

export async function disablePush() {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration(scope);
  if (!registration) return;
  await setWorkerEnabled(registration, false);
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) await subscription.unsubscribe();
  const notifications = await registration.getNotifications();
  notifications.forEach((n) => n.close());
  try {
    const { sdk, instance } = await messaging();
    await sdk.deleteToken(instance);
  } catch {
    /* Local subscription has already been removed. */
  }
}
