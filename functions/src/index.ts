import { initializeApp } from 'firebase-admin/app';
import { getAuth, type UserRecord } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { defineString } from 'firebase-functions/params';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentWrittenWithAuthContext } from 'firebase-functions/v2/firestore';
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
import { memberNotifications } from './memberEvents.js';
import { sendToUser } from './push.js';

initializeApp();
setGlobalOptions({ region: 'europe-central2', maxInstances: 5 });

const ORGANIZER_EMAIL = defineString('ORGANIZER_EMAIL');
const TEST_PUSH_MAX_DELAY_SEC = 15;
const MAX_NAME_LENGTH = 40;
const db = getFirestore();

// Logi repozytorium i projektu mogą być publiczne: nigdy nie logujemy kodów ani tokenów.

const organizerEmail = () => ORGANIZER_EMAIL.value().trim().toLowerCase();

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

function normalizeName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const n = name.trim().replace(/\s+/g, ' ');
  return n.length > 0 && n.length <= MAX_NAME_LENGTH ? n : null;
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

async function findAuthUser(email: string): Promise<UserRecord | null> {
  return getAuth()
    .getUserByEmail(email)
    .catch((err: { code?: string }) => {
      if (err.code === 'auth/user-not-found') return null;
      throw err;
    });
}

async function deleteUnusedCodes(email: string, batch = db.batch()): Promise<FirebaseFirestore.WriteBatch> {
  const codes = await db.collection('loginCodes').where('email', '==', email).get();
  codes.docs.filter((d) => d.get('usedAt') === undefined).forEach((d) => batch.delete(d.ref));
  return batch;
}

// ---------- logowanie ----------

/**
 * Wymiana maila i jednorazowego kodu na token logowania Firebase.
 * Logować się mogą tylko osoby z listy organizatora (users) – wyjątkiem jest mail organizatora,
 * którego konto powstaje przy pierwszym logowaniu kodem z konsoli.
 */
export const redeemLoginCode = onCall(async (request) => {
  const email = normalizeEmail(request.data?.email);
  const code = normalizeCode(request.data?.code);
  if (!email) throw new HttpsError('invalid-argument', 'Nieprawidłowy mail.', { field: 'email' });
  if (!code) throw new HttpsError('invalid-argument', 'Kod za krótki.', { field: 'code' });

  const now = Date.now();
  const attemptsRef = db.doc(`loginAttempts/${emailKey(email)}`);
  const attempts = (await attemptsRef.get()).data() as AttemptState | undefined;
  if (isLocked(attempts, now)) throw new HttpsError('resource-exhausted', 'Za dużo prób.');

  // Ta sama odpowiedź dla złego kodu i maila spoza listy – bez podpowiedzi, kto jest na liście
  const reject = async (reason: string): Promise<never> => {
    await attemptsRef.set(afterFailure(attempts, now));
    logger.info('Nieudana próba logowania', { emailKey: emailKey(email), reason });
    throw new HttpsError('permission-denied', 'Nieprawidłowy mail lub kod.');
  };

  // Kody wygenerowane mają mail znormalizowany; wpisy ręczne z konsoli mogą mieć wielkie litery lub spacje,
  // więc te (nieliczne – zapytanie zwraca tylko dokumenty z polem „code”) porównujemy po normalizacji
  const [generated, manual] = await Promise.all([
    db.collection('loginCodes').where('email', '==', email).get(),
    db.collection('loginCodes').orderBy('code').get(),
  ]);
  const candidates = [...generated.docs, ...manual.docs.filter((d) => normalizeEmail(d.get('email')) === email)];
  const match = candidates.find((d) => codeMatches(toEntry(d.data()), code, now));
  if (!match) return reject('code');

  const isOrganizerEmail = email === organizerEmail();
  let authUser = await findAuthUser(email);
  const userSnap = authUser ? await db.doc(`users/${authUser.uid}`).get() : null;
  const listed = userSnap?.exists === true;
  if (!listed && !isOrganizerEmail) return reject('not-listed');
  if (listed && (userSnap!.get('active') !== true || authUser!.disabled)) return reject('inactive');

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

  if (!authUser) authUser = await getAuth().createUser({ email, emailVerified: true });
  if (!listed) {
    // tylko organizator: pierwsze logowanie kodem z konsoli
    await db.doc(`users/${authUser.uid}`).set({
      email,
      displayName: 'Organizator',
      role: 'organizer',
      active: true,
      prefs: { theme: 'auto', muted: false },
      fcmTokens: [],
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  logger.info('Zalogowano kodem', { uid: authUser.uid });
  return { token: await getAuth().createCustomToken(authUser.uid) };
});

/** Organizator generuje kod dla osoby z listy. Kod wraca tylko raz; w bazie zostaje skrót. */
export const createLoginCode = onCall(async (request) => {
  const organizerUid = await requireOrganizer(request);
  const email = normalizeEmail(request.data?.email);
  if (!email) throw new HttpsError('invalid-argument', 'Nieprawidłowy mail.');

  const listed = await db.collection('users').where('email', '==', email).where('active', '==', true).limit(1).get();
  if (listed.empty) throw new HttpsError('failed-precondition', 'Tej osoby nie ma na liście albo jest wyłączona.');

  // Poprzednie niewykorzystane kody tej osoby przestają działać
  const batch = await deleteUnusedCodes(email);
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

// ---------- lista osób (organizator) ----------

/** Dodaje osobę do listy: konto logowania + dokument users. Imię nadaje organizator (decyzja A). */
export const addPerson = onCall(async (request) => {
  await requireOrganizer(request);
  const email = normalizeEmail(request.data?.email);
  const displayName = normalizeName(request.data?.displayName);
  if (!email) throw new HttpsError('invalid-argument', 'Nieprawidłowy mail.', { field: 'email' });
  if (!displayName) throw new HttpsError('invalid-argument', `Imię: od 1 do ${MAX_NAME_LENGTH} znaków.`, { field: 'displayName' });

  const auth = getAuth();
  const authUser = (await findAuthUser(email)) ?? (await auth.createUser({ email, emailVerified: true, displayName }));
  const userRef = db.doc(`users/${authUser.uid}`);
  if ((await userRef.get()).exists) throw new HttpsError('already-exists', 'Ta osoba jest już na liście.');

  await auth.updateUser(authUser.uid, { displayName, disabled: false });
  await userRef.set({
    email,
    displayName,
    role: email === organizerEmail() ? 'organizer' : 'member',
    active: true,
    prefs: { theme: 'auto', muted: false },
    fcmTokens: [],
    createdAt: FieldValue.serverTimestamp(),
  });
  return { uid: authUser.uid };
});

/** Zmiana imienia – także na listach osób przy wyjazdach. */
export const updatePerson = onCall(async (request) => {
  await requireOrganizer(request);
  const uid = typeof request.data?.uid === 'string' ? request.data.uid : '';
  const displayName = normalizeName(request.data?.displayName);
  if (!displayName) throw new HttpsError('invalid-argument', `Imię: od 1 do ${MAX_NAME_LENGTH} znaków.`, { field: 'displayName' });
  const userRef = db.doc(`users/${uid}`);
  if (!uid || !(await userRef.get()).exists) throw new HttpsError('not-found', 'Nie ma takiej osoby.');

  const batch = db.batch();
  batch.update(userRef, { displayName });
  const memberships = await db.collectionGroup('members').where('uid', '==', uid).get();
  memberships.docs.forEach((d) => batch.update(d.ref, { displayName }));
  await batch.commit();
  await getAuth().updateUser(uid, { displayName });
  return { updatedTrips: memberships.size };
});

/** Wyłączenie osoby: brak dostępu do danych od razu (reguły), wylogowanie na wszystkich urządzeniach. */
export const setPersonActive = onCall(async (request) => {
  const organizerUid = await requireOrganizer(request);
  const uid = typeof request.data?.uid === 'string' ? request.data.uid : '';
  const active = request.data?.active === true;
  if (uid === organizerUid) throw new HttpsError('failed-precondition', 'Nie możesz wyłączyć samego siebie.');
  const userRef = db.doc(`users/${uid}`);
  const user = uid ? await userRef.get() : null;
  if (!user?.exists) throw new HttpsError('not-found', 'Nie ma takiej osoby.');

  await userRef.update({ active });
  const auth = getAuth();
  await auth.updateUser(uid, { disabled: !active });
  if (!active) {
    await auth.revokeRefreshTokens(uid);
    await (await deleteUnusedCodes(user.get('email'))).commit();
  }
  return { active };
});

// ---------- powiadomienia ----------

/** Bramka techniczna: testowe powiadomienie na wszystkie urządzenia zalogowanej osoby. */
export const sendTestPush = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Zaloguj się.');
  const userRef = db.doc(`users/${uid}`);
  if (((await userRef.get()).get('fcmTokens') ?? []).length === 0) return { sent: 0, failed: 0 };

  // Opóźnienie, żeby zdążyć wyjść z aplikacji i zobaczyć powiadomienie systemowe
  const delaySec = Math.min(Math.max(Number(request.data?.delaySec) || 0, 0), TEST_PUSH_MAX_DELAY_SEC);
  if (delaySec > 0) await new Promise((resolve) => setTimeout(resolve, delaySec * 1000));

  return sendToUser(userRef, { title: 'Klub', body: 'Testowe powiadomienie działa.' });
});

/**
 * Powiadomienia o statusach przy wyjeździe:
 * zgłoszenie i wycofanie przez uczestnika → organizator; zatwierdzenie, rezygnacja, przywrócenie → uczestnik.
 */
export const onMemberWrite = onDocumentWrittenWithAuthContext('trips/{tripId}/members/{uid}', async (event) => {
  const before = event.data?.before.exists ? event.data.before.data() : undefined;
  const after = event.data?.after.exists ? event.data.after.data() : undefined;
  const { tripId, uid } = event.params;
  const trip = await db.doc(`trips/${tripId}`).get();
  // Uczestnik może zmienić tylko własny wpis (reguły), więc wszystko inne to zmiana organizatora lub konsoli
  const byMember = event.authId === uid;
  const notes = memberNotifications(before, after, trip.get('title') ?? 'wyjazd', byMember);
  const link = `/#/wyjazd/${tripId}`;
  const sends: Promise<unknown>[] = [];

  if (notes.toOrganizers) {
    const organizers = await db.collection('users').where('role', '==', 'organizer').where('active', '==', true).get();
    organizers.docs
      // organizator zgłaszający się sam na swój wyjazd nie dostaje powiadomienia o sobie
      .filter((d) => d.id !== uid && d.get('prefs.muted') !== true)
      .forEach((d) => sends.push(sendToUser(d.ref, { ...notes.toOrganizers!, link })));
  }
  if (notes.toMember) {
    const member = await db.doc(`users/${uid}`).get();
    if (member.get('active') === true && member.get('prefs.muted') !== true) {
      sends.push(sendToUser(member.ref, { ...notes.toMember, link }));
    }
  }
  await Promise.all(sends);
});
