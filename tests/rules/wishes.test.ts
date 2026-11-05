import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, getDocs, collection, serverTimestamp, setDoc, updateDoc, deleteField } from 'firebase/firestore';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-klub-wishes', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
});
afterAll(async () => env.cleanup());

const user = (role: string, name: string) => ({ email: `${name}@example.com`, displayName: name, role, active: true, prefs: { theme: 'auto', muted: false }, fcmTokens: [] });
const member = (uid: string, status: string) => ({ uid, displayName: uid, status, updatedAt: new Date() });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/jacek'), user('organizer', 'Jacek'));
    for (const n of ['ania', 'bartek', 'celina']) await setDoc(doc(db, `users/${n}`), user('member', n));
    await setDoc(doc(db, 'trips/t'), { title: 'Japonia', status: 'open' });
    await setDoc(doc(db, 'trips/t/members/ania'), member('ania', 'approved'));
    await setDoc(doc(db, 'trips/t/members/bartek'), member('bartek', 'approved'));
    await setDoc(doc(db, 'trips/t/members/celina'), member('celina', 'interested'));
    await setDoc(doc(db, 'trips/t/wishes/osm-N1'), {
      name: 'Fushimi Inari', addedBy: 'ania', addedByName: 'Ania', createdAt: new Date(), votes: { ania: { name: 'Ania', priority: 'must' } },
    });
  });
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();
const wish = (uid: string, extra: object = {}) => ({
  name: 'Kinkaku-ji', addedBy: uid, addedByName: uid, createdAt: serverTimestamp(), votes: { [uid]: { name: uid, priority: 'nice' } }, ...extra,
});

describe('lista życzeń', () => {
  it('widzą zatwierdzeni i organizator, nie zgłoszeni', async () => {
    await assertSucceeds(getDocs(collection(as('bartek'), 'trips/t/wishes')));
    await assertSucceeds(getDoc(doc(as('jacek'), 'trips/t/wishes/osm-N1')));
    await assertFails(getDocs(collection(as('celina'), 'trips/t/wishes')));
  });

  it('dodaje zatwierdzony – jako on sam, tylko ze swoim głosem', async () => {
    await assertSucceeds(setDoc(doc(as('bartek'), 'trips/t/wishes/w1'), wish('bartek', { place: { lat: 35.04, lng: 135.73 }, preferredTime: 'rano', durationMin: 60 })));
    await assertFails(setDoc(doc(as('bartek'), 'trips/t/wishes/w2'), wish('ania')));
    await assertFails(setDoc(doc(as('bartek'), 'trips/t/wishes/w3'), { ...wish('bartek'), votes: { bartek: { priority: 'nice' }, ania: { priority: 'must' } } }));
    await assertFails(setDoc(doc(as('celina'), 'trips/t/wishes/w4'), wish('celina')));
    await assertFails(setDoc(doc(as('bartek'), 'trips/t/wishes/w5'), { ...wish('bartek'), extra: 1 }));
    await assertFails(setDoc(doc(as('bartek'), 'trips/t/wishes/w6'), { ...wish('bartek'), name: '' }));
  });

  it('to samo miejsce drugi raz – nie da się nadpisać, można tylko zagłosować', async () => {
    await assertFails(setDoc(doc(as('bartek'), 'trips/t/wishes/osm-N1'), wish('bartek', { name: 'Fushimi Inari' })));
    await assertSucceeds(updateDoc(doc(as('bartek'), 'trips/t/wishes/osm-N1'), { 'votes.bartek': { name: 'Bartek', priority: 'nice' } }));
  });

  it('głos: tylko własny, można go zmienić i wycofać', async () => {
    await assertSucceeds(updateDoc(doc(as('bartek'), 'trips/t/wishes/osm-N1'), { 'votes.bartek': { name: 'Bartek', priority: 'must' } }));
    await assertSucceeds(updateDoc(doc(as('bartek'), 'trips/t/wishes/osm-N1'), { 'votes.bartek': deleteField() }));
    await assertFails(updateDoc(doc(as('bartek'), 'trips/t/wishes/osm-N1'), { 'votes.ania': deleteField() }));
    await assertFails(updateDoc(doc(as('bartek'), 'trips/t/wishes/osm-N1'), { 'votes.bartek': { priority: 'must' }, note: 'x' }));
  });

  it('szczegóły zmienia autor albo organizator, inni nie', async () => {
    await assertSucceeds(updateDoc(doc(as('ania'), 'trips/t/wishes/osm-N1'), { preferredTime: 'rano', fixedTime: '07:00' }));
    await assertSucceeds(updateDoc(doc(as('jacek'), 'trips/t/wishes/osm-N1'), { note: 'Wcześnie – tłumy od 9:00' }));
    await assertFails(updateDoc(doc(as('bartek'), 'trips/t/wishes/osm-N1'), { note: 'moja notatka' }));
    await assertFails(updateDoc(doc(as('ania'), 'trips/t/wishes/osm-N1'), { addedBy: 'bartek' }));
  });

  it('usuwa organizator albo autor, gdy nikt inny nie zagłosował', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'trips/t/wishes/osm-N1'), { 'votes.bartek': { name: 'Bartek', priority: 'nice' } });
    });
    await assertFails(deleteDoc(doc(as('ania'), 'trips/t/wishes/osm-N1')));
    await assertFails(deleteDoc(doc(as('bartek'), 'trips/t/wishes/osm-N1')));
    await assertSucceeds(deleteDoc(doc(as('jacek'), 'trips/t/wishes/osm-N1')));
    await assertSucceeds(setDoc(doc(as('bartek'), 'trips/t/wishes/w7'), wish('bartek')));
    await assertSucceeds(deleteDoc(doc(as('bartek'), 'trips/t/wishes/w7')));
  });
});
