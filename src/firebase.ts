import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseConfig, functionsRegion } from './config';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Trwała pamięć offline: dane po synchronizacji są dostępne bez sieci
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
const functions = getFunctions(app, functionsRegion);

export const redeemLoginCode = httpsCallable<{ email: string; code: string }, { token: string }>(
  functions,
  'redeemLoginCode',
);
export const createLoginCode = httpsCallable<{ email: string }, { code: string; expiresAt: string }>(
  functions,
  'createLoginCode',
);
export const sendTestPush = httpsCallable<{ delaySec: number }, { sent: number; failed: number }>(
  functions,
  'sendTestPush',
  { timeout: 60_000 },
);
