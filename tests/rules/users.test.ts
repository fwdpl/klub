import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-klub',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/jacek'), { email: 'organizator@example.com', role: 'organizer', active: true, fcmTokens: [], prefs: {} });
    await setDoc(doc(db, 'users/ania'), { email: 'ania@example.com', role: 'member', active: true, fcmTokens: [], prefs: {} });
    await setDoc(doc(db, 'users/ola'), { email: 'ola@example.com', role: 'member', active: false, fcmTokens: [], prefs: {} });
    await setDoc(doc(db, 'loginCodes/k1'), { email: 'ania@example.com', code: 'START' });
    await setDoc(doc(db, 'loginAttempts/a1'), { failures: 1 });
  });
});

const as = (uid: string | null) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();

describe('users', () => {
  it('niezalogowany nie czyta nikogo', async () => {
    await assertFails(getDoc(doc(as(null), 'users/ania')));
  });

  it('uczestnik czyta swój dokument, ale nie cudzy', async () => {
    await assertSucceeds(getDoc(doc(as('ania'), 'users/ania')));
    await assertFails(getDoc(doc(as('ania'), 'users/jacek')));
  });

  it('organizator czyta wszystkich i może wylistować kolekcję', async () => {
    await assertSucceeds(getDoc(doc(as('jacek'), 'users/ania')));
    await assertSucceeds(getDocs(collection(as('jacek'), 'users')));
  });

  it('uczestnik nie listuje całej kolekcji', async () => {
    await assertFails(getDocs(collection(as('ania'), 'users')));
  });

  it('nieaktywne konto nie czyta nawet swojego dokumentu', async () => {
    await assertFails(getDoc(doc(as('ola'), 'users/ola')));
  });

  it('zalogowany bez dokumentu (np. usunięty) nie czyta nic', async () => {
    await assertFails(getDoc(doc(as('obcy'), 'users/obcy')));
  });

  it('uczestnik zapisuje swoje tokeny i preferencje', async () => {
    await assertSucceeds(updateDoc(doc(as('ania'), 'users/ania'), { fcmTokens: ['t1'] }));
    await assertSucceeds(updateDoc(doc(as('ania'), 'users/ania'), { prefs: { theme: 'dark' } }));
  });

  it('uczestnik nie nada sobie roli organizatora ani nie zmieni maila', async () => {
    await assertFails(updateDoc(doc(as('ania'), 'users/ania'), { role: 'organizer' }));
    await assertFails(updateDoc(doc(as('ania'), 'users/ania'), { email: 'x@y.pl' }));
    await assertFails(updateDoc(doc(as('ania'), 'users/ania'), { active: false, fcmTokens: [] }));
  });

  it('nieaktywne konto nie aktywuje się samo', async () => {
    await assertFails(updateDoc(doc(as('ola'), 'users/ola'), { active: true }));
    await assertFails(updateDoc(doc(as('ola'), 'users/ola'), { fcmTokens: ['t'] }));
  });

  it('nikt nie zmienia cudzego dokumentu, nawet organizator z aplikacji', async () => {
    await assertFails(updateDoc(doc(as('ania'), 'users/jacek'), { fcmTokens: ['t'] }));
    await assertFails(updateDoc(doc(as('jacek'), 'users/ania'), { fcmTokens: ['t'] }));
  });

  it('nikt nie tworzy ani nie usuwa kont z aplikacji', async () => {
    await assertFails(setDoc(doc(as('ania'), 'users/nowy'), { email: 'n@n.pl', role: 'member', active: true }));
    await assertFails(setDoc(doc(as('jacek'), 'users/nowy'), { email: 'n@n.pl', role: 'member', active: true }));
    await assertFails(deleteDoc(doc(as('jacek'), 'users/ania')));
  });

  it('limit liczby tokenów', async () => {
    const many = Array.from({ length: 21 }, (_, i) => `t${i}`);
    await assertFails(updateDoc(doc(as('ania'), 'users/ania'), { fcmTokens: many }));
  });
});

describe('kody logowania i próby', () => {
  it('nikt z aplikacji nie czyta ani nie zapisuje kodów', async () => {
    await assertFails(getDoc(doc(as('jacek'), 'loginCodes/k1')));
    await assertFails(getDocs(collection(as('jacek'), 'loginCodes')));
    await assertFails(setDoc(doc(as('jacek'), 'loginCodes/k2'), { email: 'a@b.pl', code: 'X' }));
    await assertFails(getDoc(doc(as(null), 'loginCodes/k1')));
  });

  it('nikt z aplikacji nie czyta ani nie zeruje licznika prób', async () => {
    await assertFails(getDoc(doc(as('ania'), 'loginAttempts/a1')));
    await assertFails(deleteDoc(doc(as('ania'), 'loginAttempts/a1')));
  });
});

describe('pozostałe ścieżki', () => {
  it('są zamknięte', async () => {
    await assertFails(getDoc(doc(as('jacek'), 'trips/t1')));
    await assertFails(setDoc(doc(as('jacek'), 'trips/t1'), { title: 'x' }));
  });
});
