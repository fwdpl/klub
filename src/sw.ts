/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { initializeApp } from 'firebase/app';
import { getMessaging } from 'firebase/messaging/sw';
import { firebaseConfig } from './config';

declare const self: ServiceWorkerGlobalScope;

// Komunikat „Jest nowa wersja, odśwież” – nowa wersja przejmuje stronę dopiero po zgodzie
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Wszystkie adresy aplikacji działają offline z index.html (poza zarezerwowanymi ścieżkami Firebase)
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/__\//] }));

// Stuknięcie w powiadomienie: otwórz właściwy ekran (np. wyjazd). Gdy Klub już działa w tle, sam „focus”
// zostawiłby stary ekran (tak było na iPhonie) – dlatego okno dostaje też wiadomość, dokąd przejść.
// Zarejestrowane przed FCM, żeby obsłużyć kliknięcie zamiast domyślnej obsługi biblioteki.
self.addEventListener('notificationclick', (event) => {
  const data = (event.notification.data ?? {}) as { FCM_MSG?: { fcmOptions?: { link?: string }; notification?: { click_action?: string } } };
  const link = data.FCM_MSG?.fcmOptions?.link ?? data.FCM_MSG?.notification?.click_action ?? '/';
  event.notification.close();
  event.stopImmediatePropagation();
  event.waitUntil(
    (async () => {
      const url = new URL(link, self.location.origin);
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const client = windows.find((w) => new URL(w.url).origin === url.origin);
      if (client) {
        client.postMessage({ type: 'open', hash: url.hash });
        await client.focus();
        return;
      }
      await self.clients.openWindow(url.href);
    })(),
  );
});

// Powiadomienia w tle: wiadomości z polem „notification” biblioteka FCM wyświetla sama
initializeApp(firebaseConfig);
getMessaging();
