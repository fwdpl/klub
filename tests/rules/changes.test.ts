import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-klub-changes', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
});
afterAll(async () => env.cleanup());

const user = (role: string, name: string) => ({ email: `${name}@example.com`, displayName: name, role, active: true, prefs: { theme: 'auto', muted: false }, fcmTokens: [] });
const member = (uid: string, status: string) => ({ uid, displayName: uid, status, updatedAt: new Date() });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/jacek'), user('organizer', 'Jacek'));
    for (const n of ['ania', 'bartek', 'celina', 'dawid']) await setDoc(doc(db, `users/${n}`), user('member', n));
    await setDoc(doc(db, 'trips/t'), { title: 'Japonia', status: 'open' });
    await setDoc(doc(db, 'trips/t/members/ania'), member('ania', 'approved'));
    await setDoc(doc(db, 'trips/t/members/bartek'), member('bartek', 'approved'));
    await setDoc(doc(db, 'trips/t/members/celina'), member('celina', 'interested'));
    await setDoc(doc(db, 'trips/t/changes/plan'), { title: 'Zmiana planu', body: '', audience: 'approved', requireAck: true, createdAt: new Date() });
    await setDoc(doc(db, 'trips/t/changes/cost'), { title: 'Koszty', body: '', audience: 'interested', requireAck: false, createdAt: new Date() });
    await setDoc(doc(db, 'trips/t/changes/plan/reads/bartek'), { seenAt: new Date(), name: 'Bartek' });
    await setDoc(doc(db, 'destinations/japonia'), { name: 'Japonia', dates: 'wiosna 2027', sortDate: '2027-04', createdAt: new Date() });
    await setDoc(doc(db, 'destinations/japonia/interest/bartek'), { name: 'Bartek', at: new Date() });
  });
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();
const seen = (name: string, extra: object = {}) => ({ seenAt: serverTimestamp(), name, ...extra });

describe('potwierdzenia odczytu', () => {
  it('zmiany widzą ci, do których poszły; zapisuje tylko funkcja', async () => {
    await assertSucceeds(getDocs(query(collection(as('ania'), 'trips/t/changes'), where('audience', 'in', ['approved', 'interested']))));
    await assertSucceeds(getDocs(query(collection(as('celina'), 'trips/t/changes'), where('audience', 'in', ['interested']))));
    await assertFails(getDoc(doc(as('celina'), 'trips/t/changes/plan')));
    await assertFails(getDocs(query(collection(as('dawid'), 'trips/t/changes'), where('audience', 'in', ['interested']))));
    await assertSucceeds(getDocs(collection(as('jacek'), 'trips/t/changes')));
    await assertFails(setDoc(doc(as('jacek'), 'trips/t/changes/x'), { title: 'x', audience: 'approved' }));
  });

  it('odczyt zapisuje osoba sama, z czasem serwera; „Przyjąłem” raz, bez cofania', async () => {
    await assertSucceeds(setDoc(doc(as('ania'), 'trips/t/changes/plan/reads/ania'), seen('Ania')));
    await assertSucceeds(updateDoc(doc(as('ania'), 'trips/t/changes/plan/reads/ania'), { ackAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as('ania'), 'trips/t/changes/plan/reads/ania'), { ackAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(as('ania'), 'trips/t/changes/plan/reads/ania')));
    await assertFails(setDoc(doc(as('ania'), 'trips/t/changes/plan/reads/bartek'), seen('Bartek')));
    await assertFails(setDoc(doc(as('bartek'), 'trips/t/changes/cost/reads/bartek'), { seenAt: new Date(2020, 1, 1), name: 'Bartek' }));
    await assertFails(setDoc(doc(as('dawid'), 'trips/t/changes/cost/reads/dawid'), seen('Dawid')));
  });

  it('odczyty innych widzi tylko organizator', async () => {
    await assertSucceeds(getDocs(collection(as('jacek'), 'trips/t/changes/plan/reads')));
    await assertSucceeds(getDoc(doc(as('bartek'), 'trips/t/changes/plan/reads/bartek')));
    await assertFails(getDoc(doc(as('ania'), 'trips/t/changes/plan/reads/bartek')));
    await assertFails(getDocs(collection(as('ania'), 'trips/t/changes/plan/reads')));
  });
});

describe('kierunki (destynacje)', () => {
  it('listę widzą wszyscy, prowadzi organizator', async () => {
    await assertSucceeds(getDocs(collection(as('dawid'), 'destinations')));
    await assertFails(setDoc(doc(as('ania'), 'destinations/peru'), { name: 'Peru', createdAt: new Date() }));
    await assertSucceeds(setDoc(doc(as('jacek'), 'destinations/peru'), { name: 'Peru', dates: 'jesień 2027', sortDate: '2027-10', createdAt: new Date() }));
    await assertFails(setDoc(doc(as('jacek'), 'destinations/zle'), { name: 'Złe', sortDate: '10.2027', createdAt: new Date() }));
    await assertSucceeds(deleteDoc(doc(as('jacek'), 'destinations/peru')));
  });

  it('każdy zaznacza i widzi tylko swoje, organizator wszystkich', async () => {
    await assertSucceeds(setDoc(doc(as('ania'), 'destinations/japonia/interest/ania'), { name: 'Ania', at: serverTimestamp() }));
    await assertFails(setDoc(doc(as('ania'), 'destinations/japonia/interest/bartek'), { name: 'Bartek', at: serverTimestamp() }));
    await assertFails(getDoc(doc(as('ania'), 'destinations/japonia/interest/bartek')));
    await assertFails(getDocs(collection(as('ania'), 'destinations/japonia/interest')));
    await assertSucceeds(getDocs(collection(as('jacek'), 'destinations/japonia/interest')));
    await assertSucceeds(deleteDoc(doc(as('ania'), 'destinations/japonia/interest/ania')));
  });
});
