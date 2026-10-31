import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { defineString } from 'firebase-functions/params';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import {
  CODE_TTL_MS,
  afterFailure,
  codeMatches,
  emailKey,
  formatCode,
  generateCode,
  hashCode,
  isLocked,
  newSalt,
  normalizeCode,
  normalizeEmail,
  type AttemptState,
  type LoginCodeDoc,
} from './codes.js';

initializeApp();
setGlobalOptions({ region: 'europe-central2', maxInstances: 5 });

const ORGANIZER_EMAIL = defineString('ORGANIZER_EMAIL');
const db = getFirestore();

// Logi repozytorium i projektu mogą być publiczne: nigdy nie logujemy kodów ani tokenów.

function toEntry(data: FirebaseFirestore.DocumentData): LoginCodeDoc {
  return {
    email: data.email,
    codeHash: data.codeHash,
    salt: data.salt,
    code: data.code,
    expiresAtMs: data.expiresAt instanceof Timestamp ? data.expiresAt.toMillis() : undefined,
    usedAtMs: data.usedAt instanceof Timestamp ? data.usedAt.toMillis() : undefined,
  };
}

async function requireOrganizer(request: CallableRequest): Promise<string> {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Zaloguj się.');
  const user = await db.doc(`users/${uid}`).get();
  if (user.get('role') !== 'organizer' || user.get('active') !== true) {
    throw new HttpsError('permission-denied', 'Tylko organizator.');
  }
  return uid;
}

/** Wymiana maila i jednorazowego kodu na token logowania Firebase. */
export const redeemLoginCode = onCall(async (request) => {
  const email = normalizeEmail(request.data?.email);
  const code = normalizeCode(request.data?.code);
  if (!email || !code) throw new HttpsError('invalid-argument', 'Brak maila lub kodu.');

  const now = Date.now();
  const attemptsRef = db.doc(`loginAttempts/${emailKey(email)}`);
  const attempts = (await attemptsRef.get()).data() as AttemptState | undefined;
  if (isLocked(attempts, now)) throw new HttpsError('resource-exhausted', 'Za dużo prób.');

  // Kody wygenerowane mają mail znormalizowany; wpisy ręczne z konsoli mogą mieć wielkie litery lub spacje,
  // więc te (nieliczne – zapytanie zwraca tylko dokumenty z polem „code”) porównujemy po normalizacji
  const [generated, manual] = await Promise.all([
    db.collection('loginCodes').where('email', '==', email).get(),
    db.collection('loginCodes').orderBy('code').get(),
  ]);
  const candidates = [...generated.docs, ...manual.docs.filter((d) => normalizeEmail(d.get('email')) === email)];
  const match = candidates.find((d) => codeMatches(toEntry(d.data()), code, now));

  if (!match) {
    await attemptsRef.set(afterFailure(attempts, now));
    logger.info('Nieudana próba logowania', { emailKey: emailKey(email) });
    throw new HttpsError('permission-denied', 'Nieprawidłowy mail lub kod.');
  }

  // Kod działa raz: wpis ręczny z konsoli usuwamy, wygenerowany oznaczamy jako użyty
  const consumed = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(match.ref);
    if (!fresh.exists || !codeMatches(toEntry(fresh.data()!), code, Date.now())) return false;
    if (fresh.get('code') !== undefined) tx.delete(match.ref);
    else tx.update(match.ref, { usedAt: FieldValue.serverTimestamp() });
    return true;
  });
  if (!consumed) throw new HttpsError('permission-denied', 'Nieprawidłowy mail lub kod.');
  await attemptsRef.delete();

  const auth = getAuth();
  const authUser = await auth.getUserByEmail(email).catch(async (err: { code?: string }) => {
    if (err.code === 'auth/user-not-found') return auth.createUser({ email, emailVerified: true });
    throw err;
  });

  const userRef = db.doc(`users/${authUser.uid}`);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    await userRef.set({
      email,
      displayName: email.split('@')[0],
      role: email === ORGANIZER_EMAIL.value().trim().toLowerCase() ? 'organizer' : 'member',
      active: true,
      prefs: { theme: 'auto', muted: false },
      fcmTokens: [],
      createdAt: FieldValue.serverTimestamp(),
    });
  } else if (userSnap.get('active') !== true) {
    throw new HttpsError('permission-denied', 'Konto jest nieaktywne.');
  }

  logger.info('Zalogowano kodem', { uid: authUser.uid });
  return { token: await auth.createCustomToken(authUser.uid) };
});

/** Organizator generuje kod dla osoby z listy. Kod wraca tylko raz; w bazie zostaje skrót. */
export const createLoginCode = onCall(async (request) => {
  const organizerUid = await requireOrganizer(request);
  const email = normalizeEmail(request.data?.email);
  if (!email) throw new HttpsError('invalid-argument', 'Nieprawidłowy mail.');

  // Poprzednie niewykorzystane kody tej osoby przestają działać
  const previous = await db.collection('loginCodes').where('email', '==', email).get();
  const batch = db.batch();
  previous.docs.filter((d) => d.get('usedAt') === undefined).forEach((d) => batch.delete(d.ref));

  const code = generateCode();
  const salt = newSalt();
  const expiresAt = Timestamp.fromMillis(Date.now() + CODE_TTL_MS);
  batch.set(db.collection('loginCodes').doc(), {
    email,
    codeHash: hashCode(code, salt),
    salt,
    expiresAt,
    createdBy: organizerUid,
    createdAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  return { code: formatCode(code), expiresAt: expiresAt.toDate().toISOString() };
});

/** Bramka techniczna: testowe powiadomienie na wszystkie urządzenia zalogowanej osoby. */
export const sendTestPush = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Zaloguj się.');
  const userRef = db.doc(`users/${uid}`);
  const tokens: string[] = (await userRef.get()).get('fcmTokens') ?? [];
  if (tokens.length === 0) return { sent: 0, failed: 0 };

  const response = await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title: 'Klub', body: 'Testowe powiadomienie działa.' },
    webpush: { fcmOptions: { link: '/' } },
  });

  // Tokeny nieaktualne (odinstalowana aplikacja, cofnięta zgoda) usuwamy
  const stale = response.responses
    .map((r, i) => (r.success ? null : { token: tokens[i], code: r.error?.code }))
    .filter((r): r is { token: string; code: string | undefined } =>
      r !== null &&
      (r.code === 'messaging/registration-token-not-registered' || r.code === 'messaging/invalid-registration-token'),
    )
    .map((r) => r.token);
  if (stale.length > 0) await userRef.update({ fcmTokens: FieldValue.arrayRemove(...stale) });

  return { sent: response.successCount, failed: response.failureCount };
});
