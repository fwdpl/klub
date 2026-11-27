import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';

// Checklisty z importu (docs/tasks/zadanie-checklisty.md §4): tasks – definicje (zapis organizator),
// checklists/{uid} – postęp osoby (done) i jej własne punkty (items).

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-klub-checklists', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
});
afterAll(async () => env.cleanup());

const user = (role: string, name: string) => ({ email: `${name}@example.com`, displayName: name, role, active: true, prefs: { theme: 'auto', muted: false }, fcmTokens: [] });
const member = (uid: string, status: string) => ({ uid, displayName: uid, status, updatedAt: new Date() });
const task = (id: string, audience: string[], extra: object = {}) => ({ id, text: `Zadanie ${id}`, audience, order: 1, archived: false, schemaVersion: 1, ...extra });

// jacek – organizator; ania, bartek – zatwierdzeni; celina – zgłoszona (interested)
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/jacek'), user('organizer', 'Jacek'));
    for (const n of ['Ania', 'Bartek', 'Celina']) await setDoc(doc(db, `users/${n.toLowerCase()}`), user('member', n));
    await setDoc(doc(db, 'trips/t'), { title: 'USA', status: 'open' });
    await setDoc(doc(db, 'trips/t/members/ania'), member('ania', 'approved'));
    await setDoc(doc(db, 'trips/t/members/bartek'), member('bartek', 'approved'));
    await setDoc(doc(db, 'trips/t/members/celina'), member('celina', 'interested'));
    await setDoc(doc(db, 'trips/t/tasks/esim'), task('esim', ['all']));
    await setDoc(doc(db, 'trips/t/tasks/esta-ania'), task('esta-ania', ['ania']));
    await setDoc(doc(db, 'trips/t/tasks/stary'), task('stary', ['all'], { archived: true }));
    await setDoc(doc(db, 'trips/t/checklists/ania'), { done: { esim: new Date() }, items: [{ id: 'w1', text: 'Aparat', done: false }] });
  });
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();
const myTasks = (uid: string) => query(collection(as(uid), 'trips/t/tasks'), where('audience', 'array-contains-any', ['all', uid]), where('archived', '==', false));

describe('zadania (tasks)', () => {
  it('uczestnik nie widzi zadania przypisanego innej osobie', async () => {
    await assertSucceeds(getDoc(doc(as('ania'), 'trips/t/tasks/esta-ania')));
    await assertSucceeds(getDoc(doc(as('bartek'), 'trips/t/tasks/esim')));
    await assertFails(getDoc(doc(as('bartek'), 'trips/t/tasks/esta-ania')));
  });

  it('zapytanie array-contains-any [all, uid] przechodzi, a zapytanie bez filtra jest odrzucane', async () => {
    await assertSucceeds(getDocs(myTasks('bartek')));
    await assertSucceeds(getDocs(myTasks('ania')));
    await assertFails(getDocs(collection(as('bartek'), 'trips/t/tasks')));
    await assertFails(getDocs(query(collection(as('bartek'), 'trips/t/tasks'), where('archived', '==', false))));
    // cudzy uid w filtrze też nie przejdzie
    await assertFails(getDocs(query(collection(as('bartek'), 'trips/t/tasks'), where('audience', 'array-contains-any', ['all', 'ania']))));
  });

  it('interested nie widzi zadań', async () => {
    await assertFails(getDoc(doc(as('celina'), 'trips/t/tasks/esim')));
    await assertFails(getDocs(myTasks('celina')));
  });

  it('uczestnik nie zapisze tasks', async () => {
    await assertFails(setDoc(doc(as('ania'), 'trips/t/tasks/nowe'), task('nowe', ['all'])));
    await assertFails(updateDoc(doc(as('ania'), 'trips/t/tasks/esim'), { text: 'Zmiana' }));
    await assertFails(deleteDoc(doc(as('ania'), 'trips/t/tasks/esim')));
  });

  it('organizator czyta wszystko i zapisuje zadania w ustalonym kształcie', async () => {
    await assertSucceeds(getDocs(collection(as('jacek'), 'trips/t/tasks')));
    const links = [{ label: 'Kup eSIM', url: 'https://example.com/?ref=jacek', sponsored: true }];
    await assertSucceeds(
      setDoc(doc(as('jacek'), 'trips/t/tasks/nowe'), {
        ...task('nowe', ['ania', 'bartek'], { links, due: '2027-01-15', category: 'Dokumenty', details: 'opis' }),
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(setDoc(doc(as('jacek'), 'trips/t/tasks/x1'), task('x2', ['all'])));
    await assertFails(setDoc(doc(as('jacek'), 'trips/t/tasks/x'), task('x', [])));
    await assertFails(setDoc(doc(as('jacek'), 'trips/t/tasks/x'), task('x', ['all'], { text: '' })));
    await assertFails(setDoc(doc(as('jacek'), 'trips/t/tasks/x'), task('x', ['all'], { due: '15.01.2027' })));
    await assertFails(setDoc(doc(as('jacek'), 'trips/t/tasks/x'), task('x', ['all'], { html: '<b>' })));
    await assertFails(setDoc(doc(as('jacek'), 'trips/t/tasks/x'), task('x', ['all'], { schemaVersion: 2 })));
    await assertFails(setDoc(doc(as('jacek'), 'trips/t/tasks/Zle_ID'), task('Zle_ID', ['all'])));
    await assertSucceeds(deleteDoc(doc(as('jacek'), 'trips/t/tasks/stary')));
  });
});

describe('postęp (checklists/{uid})', () => {
  it('właściciel odhacza (done) i dopisuje własne punkty; offline-friendly zapis z merge', async () => {
    await assertSucceeds(getDoc(doc(as('ania'), 'trips/t/checklists/ania')));
    await assertSucceeds(setDoc(doc(as('ania'), 'trips/t/checklists/ania'), { done: { 'esta-ania': serverTimestamp() }, updatedAt: serverTimestamp() }, { merge: true }));
    await assertSucceeds(setDoc(doc(as('ania'), 'trips/t/checklists/ania'), { done: { esim: deleteField() } }, { merge: true }));
    await assertSucceeds(setDoc(doc(as('bartek'), 'trips/t/checklists/bartek'), { done: { esim: serverTimestamp() }, updatedAt: serverTimestamp() }, { merge: true }));
    await assertSucceeds(setDoc(doc(as('bartek'), 'trips/t/checklists/bartek'), { items: [{ id: 'w', text: 'Statyw', done: true }] }, { merge: true }));
  });

  it('uczestnik nie zmieni cudzego checklists', async () => {
    await assertFails(getDoc(doc(as('bartek'), 'trips/t/checklists/ania')));
    await assertFails(setDoc(doc(as('bartek'), 'trips/t/checklists/ania'), { done: { esim: serverTimestamp() } }, { merge: true }));
    await assertFails(deleteDoc(doc(as('ania'), 'trips/t/checklists/ania')));
  });

  it('uczestnik nie zmieni pól poza done (i własnymi punktami)', async () => {
    await assertFails(updateDoc(doc(as('ania'), 'trips/t/checklists/ania'), { owner: 'ktoś' }));
    await assertFails(updateDoc(doc(as('ania'), 'trips/t/checklists/ania'), { templateDone: { c1: true } }));
    await assertFails(updateDoc(doc(as('ania'), 'trips/t/checklists/ania'), { done: 'wszystko' }));
  });

  it('niezatwierdzony nie zakłada postępu', async () => {
    await assertFails(setDoc(doc(as('celina'), 'trips/t/checklists/celina'), { done: { esim: serverTimestamp() } }, { merge: true }));
    await assertFails(getDoc(doc(as('celina'), 'trips/t/checklists/celina')));
  });

  it('organizator czyta wszystkie i zmienia każde pole (delete, resetDone, replace)', async () => {
    await assertSucceeds(getDocs(collection(as('jacek'), 'trips/t/checklists')));
    await assertSucceeds(updateDoc(doc(as('jacek'), 'trips/t/checklists/ania'), { 'done.esim': deleteField(), templateDone: deleteField() }));
    await assertSucceeds(setDoc(doc(as('jacek'), 'trips/t/checklists/bartek'), { done: {} }, { merge: true }));
  });

  it('po rezygnacji odhaczenia zostają, ale osoba ich już nie zmienia', async () => {
    await updateDoc(doc(as('jacek'), 'trips/t/members/ania'), { status: 'withdrawn' });
    await assertFails(setDoc(doc(as('ania'), 'trips/t/checklists/ania'), { done: { esim: serverTimestamp() } }, { merge: true }));
    await assertSucceeds(getDoc(doc(as('jacek'), 'trips/t/checklists/ania')));
  });
});
