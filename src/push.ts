import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { arrayUnion, doc, updateDoc } from 'firebase/firestore';
import { app, db } from './firebase';
import { vapidKey } from './config';
import { toast } from './ui';

export type PushState = NotificationPermission | 'unsupported';

export async function pushState(): Promise<PushState> {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported';
  if (!(await isSupported())) return 'unsupported';
  return Notification.permission;
}

/** Wywoływać wyłącznie z kliknięcia – iOS pozwala zapytać o zgodę tylko po geście użytkownika. */
export async function enablePush(uid: string): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Brak zgody na powiadomienia. Można ją włączyć w ustawieniach telefonu.');
  }
  const registration = await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: registration });
  // Każda instalacja ma własny token
  await updateDoc(doc(db, 'users', uid), { fcmTokens: arrayUnion(token) });
}

/** Gdy aplikacja jest na ekranie, system nie pokazuje powiadomienia – pokazujemy je w aplikacji. */
export async function listenForegroundMessages(): Promise<void> {
  if ((await pushState()) === 'unsupported') return;
  onMessage(getMessaging(app), (payload) => {
    const title = payload.notification?.title ?? 'Klub';
    const body = payload.notification?.body ?? '';
    toast(body ? `${title}: ${body}` : title);
  });
}
