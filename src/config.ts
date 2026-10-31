import type { FirebaseOptions } from 'firebase/app';

// Konfiguracja webowa Firebase jest jawna (trafia do przeglądarki każdego użytkownika).
// Dostęp do danych chronią reguły Firestore, nie ukrywanie tych wartości.
const TEST: FirebaseOptions = {
  apiKey: 'AIzaSyCDhxh85gy73zrMbYV-kCvFwOgyZ4Mr5Ek',
  authDomain: 'klub-test-bakutis.firebaseapp.com',
  projectId: 'klub-test-bakutis',
  storageBucket: 'klub-test-bakutis.firebasestorage.app',
  messagingSenderId: '1088075635304',
  appId: '1:1088075635304:web:c405436a5f1e90398179dd',
};

// Publiczny klucz VAPID (Web Push) projektu testowego
const TEST_VAPID = 'BAlUBjDN9slfcjCMr6_nI8O5d2JCZh_vRBucyDxF-OgCMJdVdDXEgsE-bbx54Z4lTnwzYjTYKWPuwDEAE7SGmtA';

// Projekt produkcyjny (klub-bakutis) – uzupełnić po rejestracji aplikacji webowej
const PROD: FirebaseOptions | null = null;
const PROD_VAPID: string | null = null;

const isProd = import.meta.env.MODE === 'production';

function required<T>(value: T | null, name: string): T {
  if (value === null) throw new Error(`Brak konfiguracji produkcyjnej: ${name}`);
  return value;
}

export const firebaseConfig: FirebaseOptions = isProd ? required<FirebaseOptions>(PROD, 'firebaseConfig') : TEST;
export const vapidKey: string = isProd ? required<string>(PROD_VAPID, 'vapidKey') : TEST_VAPID;
export const functionsRegion = 'europe-central2';
export const appVersion: string = __APP_VERSION__;
export const buildId: string = __BUILD_ID__;
export const isTestEnv = !isProd;
