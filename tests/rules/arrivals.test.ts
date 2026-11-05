import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-klub-arrivals', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
});
afterAll(async () => env.cleanup());

const user = (role: string, name: string) => ({ email: `${name}@example.com`, displayName: name, role, active: true, prefs: { theme: 'auto', muted: false }, fcmTokens: [] });
const member = (uid: string, status: string) => ({ uid, displayName: uid, status, updatedAt: new Date() });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/jacek'), user('organizer', 'Jacek'));
    for (const n of ['Ania', 'Bartek', 'Celina']) await setDoc(doc(db, `users/${n.toLowerCase()}`), user('member', n));
    await setDoc(doc(db, 'trips/t'), { title: 'Japonia', status: 'open' });
    await setDoc(doc(db, 'trips/t/members/ania'), member('ania', 'approved'));
    await setDoc(doc(db, 'trips/t/members/bartek'), member('bartek', 'approved'));
    await setDoc(doc(db, 'trips/t/members/celina'), member('celina', 'interested'));
    await setDoc(doc(db, 'trips/t/arrivals/a1'), { uid: 'ania', name: 'Ania', to: 'organizer', createdAt: new Date() });
    await setDoc(doc(db, 'trips/t/arrivals/a2'), { uid: 'ania', name: 'Ania', to: 'all', createdAt: new Date() });
  });
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();
const arrival = (uid: string, name: string, extra: object = {}) => ({ uid, name, to: 'all', createdAt: serverTimestamp(), ...extra });

describe('jestem na miejscu', () => {
  it('zatwierdzony zgłasza tylko siebie, z imieniem z konta', async () => {
    await assertSucceeds(setDoc(doc(as('bartek'), 'trips/t/arrivals/b1'), arrival('bartek', 'Bartek', { note: 'w hotelu' })));
    await assertSucceeds(setDoc(doc(as('bartek'), 'trips/t/arrivals/b2'), arrival('bartek', 'Bartek', { to: 'organizer' })));
    await assertFails(setDoc(doc(as('bartek'), 'trips/t/arrivals/b3'), arrival('ania', 'Ania')));
    await assertFails(setDoc(doc(as('bartek'), 'trips/t/arrivals/b4'), arrival('bartek', 'Ktoś inny')));
    await assertFails(setDoc(doc(as('bartek'), 'trips/t/arrivals/b5'), arrival('bartek', 'Bartek', { to: 'wszyscy' })));
    await assertFails(setDoc(doc(as('celina'), 'trips/t/arrivals/c1'), arrival('celina', 'Celina')));
  });

  it('„do organizatora” widzą tylko nadawca i organizator', async () => {
    await assertSucceeds(getDoc(doc(as('ania'), 'trips/t/arrivals/a1')));
    await assertSucceeds(getDoc(doc(as('jacek'), 'trips/t/arrivals/a1')));
    await assertFails(getDoc(doc(as('bartek'), 'trips/t/arrivals/a1')));
    await assertSucceeds(getDocs(query(collection(as('bartek'), 'trips/t/arrivals'), where('to', '==', 'all'))));
    await assertFails(getDocs(collection(as('bartek'), 'trips/t/arrivals')));
    await assertSucceeds(getDocs(collection(as('jacek'), 'trips/t/arrivals')));
    await assertFails(getDocs(query(collection(as('celina'), 'trips/t/arrivals'), where('to', '==', 'all'))));
  });

  it('bez zmian; usuwa organizator', async () => {
    await assertFails(updateDoc(doc(as('ania'), 'trips/t/arrivals/a2'), { note: 'x' }));
    await assertFails(deleteDoc(doc(as('ania'), 'trips/t/arrivals/a2')));
    await assertSucceeds(deleteDoc(doc(as('jacek'), 'trips/t/arrivals/a2')));
  });
});
