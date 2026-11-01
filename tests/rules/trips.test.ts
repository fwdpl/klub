import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

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

const trip = (status: string) => ({
  title: `Wyjazd ${status}`,
  destination: 'Islandia',
  approxDates: 'marzec 2027',
  description: 'opis',
  status,
  timezone: 'Atlantic/Reykjavik',
  schemaVersion: 1,
});

const member = (uid: string, displayName: string, status: string) => ({ uid, displayName, status, updatedAt: new Date() });

// Osoby: jacek – organizator; ania – zatwierdzona; bartek – zainteresowany; celina – bez statusu;
// darek – po rezygnacji; ola – zatwierdzona, ale wyłączona z listy
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const user = (role: string, name: string, active = true) => ({
      email: `${name.toLowerCase()}@example.com`,
      displayName: name,
      role,
      active,
      prefs: { theme: 'auto', muted: false },
      fcmTokens: [],
    });
    await setDoc(doc(db, 'users/jacek'), user('organizer', 'Jacek'));
    await setDoc(doc(db, 'users/ania'), user('member', 'Ania'));
    await setDoc(doc(db, 'users/bartek'), user('member', 'Bartek'));
    await setDoc(doc(db, 'users/celina'), user('member', 'Celina'));
    await setDoc(doc(db, 'users/darek'), user('member', 'Darek'));
    await setDoc(doc(db, 'users/ola'), user('member', 'Ola', false));

    for (const status of ['open', 'closed', 'draft', 'archived']) {
      await setDoc(doc(db, `trips/t-${status}`), trip(status));
    }
    for (const t of ['t-open', 't-archived']) {
      await setDoc(doc(db, `trips/${t}/members/ania`), member('ania', 'Ania', 'approved'));
      await setDoc(doc(db, `trips/${t}/members/bartek`), member('bartek', 'Bartek', 'interested'));
      await setDoc(doc(db, `trips/${t}/overview/main`), { planSummary: 'plan', costEstimate: '5000 zł' });
      await setDoc(doc(db, `trips/${t}/info/main`), { flights: [], hotels: [], emergencyContacts: [], insurance: '', countryCard: {} });
      await setDoc(doc(db, `trips/${t}/days/2027-03-10`), { date: '2027-03-10', items: [] });
      await setDoc(doc(db, `trips/${t}/checklists/ania`), { items: [{ id: '1', text: 'paszport', done: false }] });
    }
    await setDoc(doc(db, 'trips/t-open/members/darek'), member('darek', 'Darek', 'withdrawn'));
    await setDoc(doc(db, 'trips/t-open/members/ola'), member('ola', 'Ola', 'approved'));
  });
});

const as = (uid: string | null) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();
const interested = (uid: string, displayName: string) => ({ uid, displayName, status: 'interested', updatedAt: serverTimestamp() });

describe('wyjazdy – warstwa 1', () => {
  it('osoba z listy widzi wyjazdy otwarte i zamknięte, ale nie szkic', async () => {
    await assertSucceeds(getDoc(doc(as('celina'), 'trips/t-open')));
    await assertSucceeds(getDoc(doc(as('celina'), 'trips/t-closed')));
    await assertFails(getDoc(doc(as('celina'), 'trips/t-draft')));
  });

  it('archiwum widzą tylko zatwierdzeni (decyzja B)', async () => {
    await assertSucceeds(getDoc(doc(as('ania'), 'trips/t-archived')));
    await assertFails(getDoc(doc(as('bartek'), 'trips/t-archived')));
    await assertFails(getDoc(doc(as('celina'), 'trips/t-archived')));
  });

  it('organizator widzi wszystko, także szkice', async () => {
    await assertSucceeds(getDoc(doc(as('jacek'), 'trips/t-draft')));
    await assertSucceeds(getDocs(collection(as('jacek'), 'trips')));
  });

  it('lista wyjazdów uczestnika musi filtrować po stanie', async () => {
    await assertSucceeds(getDocs(query(collection(as('celina'), 'trips'), where('status', 'in', ['open', 'closed']))));
    await assertFails(getDocs(collection(as('celina'), 'trips')));
  });

  it('niezalogowany i wyłączony z listy nie widzą nic', async () => {
    await assertFails(getDoc(doc(as(null), 'trips/t-open')));
    await assertFails(getDoc(doc(as('ola'), 'trips/t-open')));
    await assertFails(getDoc(doc(as('nieznany'), 'trips/t-open')));
  });

  it('wyjazdy tworzy i zmienia tylko organizator, z poprawnym stanem', async () => {
    await assertFails(setDoc(doc(as('ania'), 'trips/nowy'), trip('open')));
    await assertFails(updateDoc(doc(as('ania'), 'trips/t-open'), { title: 'Zmiana' }));
    await assertSucceeds(setDoc(doc(as('jacek'), 'trips/nowy'), trip('draft')));
    await assertFails(setDoc(doc(as('jacek'), 'trips/zly'), trip('cokolwiek')));
    await assertFails(setDoc(doc(as('jacek'), 'trips/zly2'), { ...trip('open'), title: '' }));
    await assertFails(setDoc(doc(as('jacek'), 'trips/zly3'), { ...trip('open'), timezone: '' }));
    await assertSucceeds(updateDoc(doc(as('jacek'), 'trips/t-open'), { status: 'closed' }));
    await assertFails(deleteDoc(doc(as('ania'), 'trips/t-open')));
  });
});

describe('statusy – lista osób przy wyjeździe (wariant C)', () => {
  it('zainteresowani i zatwierdzeni widzą listę', async () => {
    await assertSucceeds(getDocs(collection(as('bartek'), 'trips/t-open/members')));
    await assertSucceeds(getDocs(collection(as('ania'), 'trips/t-open/members')));
    await assertSucceeds(getDocs(collection(as('jacek'), 'trips/t-open/members')));
  });

  it('osoba bez statusu i po rezygnacji nie widzi listy, ale widzi swój wpis', async () => {
    await assertFails(getDocs(collection(as('celina'), 'trips/t-open/members')));
    await assertFails(getDocs(collection(as('darek'), 'trips/t-open/members')));
    await assertSucceeds(getDoc(doc(as('darek'), 'trips/t-open/members/darek')));
    await assertSucceeds(getDoc(doc(as('celina'), 'trips/t-open/members/celina')));
    await assertFails(getDoc(doc(as('celina'), 'trips/t-open/members/ania')));
  });

  it('w archiwum listę widzą tylko zatwierdzeni', async () => {
    await assertSucceeds(getDocs(collection(as('ania'), 'trips/t-archived/members')));
    await assertFails(getDocs(collection(as('bartek'), 'trips/t-archived/members')));
  });

  it('„też tam chcę”: własny wpis jako zainteresowany przy otwartym wyjeździe', async () => {
    await assertSucceeds(setDoc(doc(as('celina'), 'trips/t-open/members/celina'), interested('celina', 'Celina')));
  });

  it('„też tam chcę” odrzucone: cudze imię, inny status, cudzy wpis, dodatkowe pola', async () => {
    await assertFails(setDoc(doc(as('celina'), 'trips/t-open/members/celina'), interested('celina', 'Królowa')));
    await assertFails(setDoc(doc(as('celina'), 'trips/t-open/members/celina'), { ...interested('celina', 'Celina'), status: 'approved' }));
    await assertFails(setDoc(doc(as('celina'), 'trips/t-open/members/ewa'), interested('ewa', 'Celina')));
    await assertFails(setDoc(doc(as('celina'), 'trips/t-open/members/celina'), { ...interested('celina', 'Celina'), note: 'x' }));
    await assertFails(setDoc(doc(as('celina'), 'trips/t-open/members/celina'), { ...interested('celina', 'Celina'), updatedAt: new Date(0) }));
  });

  it('„też tam chcę” tylko przy otwartym wyjeździe', async () => {
    await assertFails(setDoc(doc(as('celina'), 'trips/t-closed/members/celina'), interested('celina', 'Celina')));
    await assertFails(setDoc(doc(as('celina'), 'trips/t-draft/members/celina'), interested('celina', 'Celina')));
    await assertFails(setDoc(doc(as('celina'), 'trips/t-archived/members/celina'), interested('celina', 'Celina')));
  });

  it('wyłączona osoba nie zgłasza się', async () => {
    await assertFails(setDoc(doc(as('ola'), 'trips/t-closed/members/ola'), interested('ola', 'Ola')));
  });

  it('zainteresowany sam się wycofuje; zatwierdzony już nie', async () => {
    await assertSucceeds(deleteDoc(doc(as('bartek'), 'trips/t-open/members/bartek')));
    await assertFails(deleteDoc(doc(as('ania'), 'trips/t-open/members/ania')));
  });

  it('po rezygnacji osoba nie zgłasza się ponownie sama (decyzja C)', async () => {
    await assertFails(setDoc(doc(as('darek'), 'trips/t-open/members/darek'), interested('darek', 'Darek')));
    await assertFails(deleteDoc(doc(as('darek'), 'trips/t-open/members/darek')));
  });

  it('zatwierdza i wpisuje rezygnację tylko organizator', async () => {
    await assertFails(updateDoc(doc(as('bartek'), 'trips/t-open/members/bartek'), { status: 'approved' }));
    await assertSucceeds(updateDoc(doc(as('jacek'), 'trips/t-open/members/bartek'), { status: 'approved' }));
    await assertSucceeds(updateDoc(doc(as('jacek'), 'trips/t-open/members/ania'), { status: 'withdrawn' }));
    await assertFails(updateDoc(doc(as('jacek'), 'trips/t-open/members/ania'), { status: 'vip' }));
    await assertSucceeds(updateDoc(doc(as('jacek'), 'trips/t-open/members/darek'), { status: 'interested' }));
  });
});

describe('własne statusy na wszystkich wyjazdach', () => {
  it('osoba pobiera swoje wpisy jednym zapytaniem z filtrem po uid', async () => {
    const q = query(collectionGroup(as('ania'), 'members'), where('uid', '==', 'ania'));
    await assertSucceeds(getDocs(q));
  });

  it('nie da się pobrać cudzych wpisów ani wszystkich naraz', async () => {
    await assertFails(getDocs(query(collectionGroup(as('celina'), 'members'), where('uid', '==', 'ania'))));
    await assertFails(getDocs(collectionGroup(as('celina'), 'members')));
  });

  it('wyłączona osoba nie pobiera nawet swoich wpisów', async () => {
    await assertFails(getDocs(query(collectionGroup(as('ola'), 'members'), where('uid', '==', 'ola'))));
  });

  it('organizator dopisuje osobę od razu jako zatwierdzoną', async () => {
    await assertSucceeds(setDoc(doc(as('jacek'), 'trips/t-open/members/celina'), member('celina', 'Celina', 'approved')));
  });
});

describe('warstwa 2 – ogólny plan i koszty', () => {
  it('widzą zainteresowani i zatwierdzeni', async () => {
    await assertSucceeds(getDoc(doc(as('bartek'), 'trips/t-open/overview/main')));
    await assertSucceeds(getDoc(doc(as('ania'), 'trips/t-open/overview/main')));
    await assertSucceeds(getDoc(doc(as('jacek'), 'trips/t-open/overview/main')));
  });

  it('nie widzą: bez statusu, po rezygnacji, wyłączeni', async () => {
    await assertFails(getDoc(doc(as('celina'), 'trips/t-open/overview/main')));
    await assertFails(getDoc(doc(as('darek'), 'trips/t-open/overview/main')));
    await assertFails(getDoc(doc(as('ola'), 'trips/t-open/overview/main')));
  });

  it('w archiwum widzą tylko zatwierdzeni', async () => {
    await assertSucceeds(getDoc(doc(as('ania'), 'trips/t-archived/overview/main')));
    await assertFails(getDoc(doc(as('bartek'), 'trips/t-archived/overview/main')));
  });

  it('zmienia tylko organizator', async () => {
    await assertFails(updateDoc(doc(as('ania'), 'trips/t-open/overview/main'), { costEstimate: '1 zł' }));
    await assertSucceeds(updateDoc(doc(as('jacek'), 'trips/t-open/overview/main'), { costEstimate: '6000 zł' }));
  });
});

describe('warstwa 3 – szczegóły', () => {
  it('informacje i plan dni widzą tylko zatwierdzeni', async () => {
    await assertSucceeds(getDoc(doc(as('ania'), 'trips/t-open/info/main')));
    await assertSucceeds(getDoc(doc(as('ania'), 'trips/t-open/days/2027-03-10')));
    await assertSucceeds(getDocs(collection(as('ania'), 'trips/t-open/days')));
    await assertFails(getDoc(doc(as('bartek'), 'trips/t-open/info/main')));
    await assertFails(getDocs(collection(as('bartek'), 'trips/t-open/days')));
    await assertFails(getDoc(doc(as('celina'), 'trips/t-open/info/main')));
    await assertFails(getDoc(doc(as('darek'), 'trips/t-open/days/2027-03-10')));
  });

  it('wyłączona osoba traci dostęp mimo statusu „zatwierdzona”', async () => {
    await assertFails(getDoc(doc(as('ola'), 'trips/t-open/info/main')));
  });

  it('po rezygnacji wpisanej przez organizatora dostęp znika od razu', async () => {
    await updateDoc(doc(as('jacek'), 'trips/t-open/members/ania'), { status: 'withdrawn' });
    await assertFails(getDoc(doc(as('ania'), 'trips/t-open/info/main')));
    await assertFails(getDoc(doc(as('ania'), 'trips/t-open/overview/main')));
  });

  it('szczegóły zmienia tylko organizator', async () => {
    await assertFails(updateDoc(doc(as('ania'), 'trips/t-open/info/main'), { insurance: 'x' }));
    await assertFails(setDoc(doc(as('ania'), 'trips/t-open/days/2027-03-11'), { date: '2027-03-11', items: [] }));
    await assertSucceeds(setDoc(doc(as('jacek'), 'trips/t-open/days/2027-03-11'), { date: '2027-03-11', items: [] }));
  });
});

describe('checklisty osobiste', () => {
  it('zatwierdzona osoba czyta i odhacza swoją listę', async () => {
    await assertSucceeds(getDoc(doc(as('ania'), 'trips/t-open/checklists/ania')));
    await assertSucceeds(updateDoc(doc(as('ania'), 'trips/t-open/checklists/ania'), { items: [{ id: '1', text: 'paszport', done: true }] }));
  });

  it('nie widać cudzej listy; dodatkowe pola odrzucone', async () => {
    await assertFails(getDoc(doc(as('bartek'), 'trips/t-open/checklists/ania')));
    await assertFails(updateDoc(doc(as('ania'), 'trips/t-open/checklists/ania'), { owner: 'ktoś' }));
  });

  it('niezatwierdzony nie zakłada listy; organizator widzi wszystkie', async () => {
    await assertFails(setDoc(doc(as('bartek'), 'trips/t-open/checklists/bartek'), { items: [] }));
    await assertSucceeds(getDoc(doc(as('jacek'), 'trips/t-open/checklists/ania')));
    await assertFails(deleteDoc(doc(as('ania'), 'trips/t-open/checklists/ania')));
  });
});
