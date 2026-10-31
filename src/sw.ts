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

// Powiadomienia w tle: wiadomości z polem „notification” biblioteka FCM wyświetla sama
initializeApp(firebaseConfig);
getMessaging();
