import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseConfig, functionsRegion } from './config';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Trwała pamięć offline: dane po synchronizacji są dostępne bez sieci
export const db = initializeFirestore(app, {
  // pola opcjonalne modelu bywają puste – nie zapisujemy ich zamiast rzucać błąd
  ignoreUndefinedProperties: true,
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
const functions = getFunctions(app, functionsRegion);

// Lokalnie z emulatorami: VITE_USE_EMULATORS=1 npm run dev (dane tylko w emulatorze)
if (import.meta.env.VITE_USE_EMULATORS === '1') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}

export const redeemLoginCode = httpsCallable<{ email: string; code: string }, { token: string }>(
  functions,
  'redeemLoginCode',
);
export const createLoginCode = httpsCallable<{ email: string }, { code: string; expiresAt: string }>(
  functions,
  'createLoginCode',
);
export const addPerson = httpsCallable<{ email: string; displayName: string }, { uid: string }>(functions, 'addPerson');
export const updatePerson = httpsCallable<{ uid: string; displayName: string }, { updatedTrips: number }>(
  functions,
  'updatePerson',
);
export const setPersonActive = httpsCallable<{ uid: string; active: boolean }, { active: boolean }>(
  functions,
  'setPersonActive',
);
export const sendTestPush = httpsCallable<{ delaySec: number }, { sent: number; failed: number }>(
  functions,
  'sendTestPush',
  { timeout: 60_000 },
);
