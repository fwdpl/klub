import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-klub-expenses',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
afterAll(async () => env.cleanup());

const user = (role: string, name: string) => ({
  email: `${name}@example.com`,
  displayName: name,
  role,
  active: true,
  prefs: { theme: 'auto', muted: false },
  fcmTokens: [],
});
const member = (uid: string, status: string) => ({
  uid,
  displayName: uid,
  status,
  updatedAt: new Date(),
});

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
    await setDoc(doc(db, 'trips/t/expenses/e1'), {
      ...expense('ania'),
      createdAt: new Date(),
    });
    await setDoc(doc(db, 'trips/t/payments/ania'), {
      name: 'Ania',
      items: [{ id: 'p1', title: 'Lot', amount: 3200, currency: 'PLN' }],
    });
  });
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();
const expense = (uid: string, extra: object = {}) => ({
  kind: 'expense',
  title: 'Kolacja',
  amount: 9000,
  currency: 'JPY',
  date: '2026-12-11',
  category: 'food',
  paidBy: uid,
  split: 'equal',
  shares: { ania: 4500, bartek: 4500 },
  names: { ania: 'Ania', bartek: 'Bartek' },
  createdBy: uid,
  createdAt: serverTimestamp(),
  ...extra,
});

describe('wspólne wydatki', () => {
  it('widzą zatwierdzeni i organizator, nie zgłoszeni', async () => {
    await assertSucceeds(getDocs(collection(as('bartek'), 'trips/t/expenses')));
    await assertSucceeds(getDoc(doc(as('jacek'), 'trips/t/expenses/e1')));
    await assertFails(getDocs(collection(as('celina'), 'trips/t/expenses')));
  });

  it('dodaje zatwierdzony (także za kogoś, kto płacił), zawsze jako wpisujący', async () => {
    await assertSucceeds(setDoc(doc(as('bartek'), 'trips/t/expenses/e2'), expense('bartek')));
    await assertSucceeds(setDoc(doc(as('bartek'), 'trips/t/expenses/e3'), expense('bartek', { paidBy: 'ania' })));
    await assertSucceeds(
      setDoc(
        doc(as('bartek'), 'trips/t/expenses/e4'),
        expense('bartek', {
          kind: 'transfer',
          title: 'Zwrot',
          shares: { ania: 4500 },
          split: 'amounts',
        }),
      ),
    );
    await assertFails(setDoc(doc(as('bartek'), 'trips/t/expenses/e5'), expense('ania')));
    await assertFails(setDoc(doc(as('celina'), 'trips/t/expenses/e6'), expense('celina')));
  });

  it('odrzuca błędne dane', async () => {
    const bad = [{ amount: 0 }, { amount: '9000' }, { currency: 'JEN!' }, { shares: {} }, { kind: 'gift' }, { title: '' }, { extra: true }, { split: 'half' }];
    for (const [i, b] of bad.entries()) await assertFails(setDoc(doc(as('bartek'), `trips/t/expenses/bad${i}`), expense('bartek', b)));
  });

  it('poprawia i usuwa wpisujący albo organizator', async () => {
    await assertSucceeds(
      updateDoc(doc(as('ania'), 'trips/t/expenses/e1'), {
        amount: 9600,
        shares: { ania: 4800, bartek: 4800 },
      }),
    );
    await assertFails(updateDoc(doc(as('bartek'), 'trips/t/expenses/e1'), { amount: 1 }));
    await assertFails(
      updateDoc(doc(as('ania'), 'trips/t/expenses/e1'), {
        createdBy: 'bartek',
      }),
    );
    await assertSucceeds(
      updateDoc(doc(as('jacek'), 'trips/t/expenses/e1'), {
        title: 'Kolacja w izakayi',
      }),
    );
    await assertFails(deleteDoc(doc(as('bartek'), 'trips/t/expenses/e1')));
    await assertSucceeds(deleteDoc(doc(as('ania'), 'trips/t/expenses/e1')));
  });
});

describe('wpłaty na wyjazd', () => {
  it('osoba widzi tylko swoje, organizator wszystkie', async () => {
    await assertSucceeds(getDoc(doc(as('ania'), 'trips/t/payments/ania')));
    await assertFails(getDoc(doc(as('bartek'), 'trips/t/payments/ania')));
    await assertFails(getDocs(collection(as('bartek'), 'trips/t/payments')));
    await assertSucceeds(getDocs(collection(as('jacek'), 'trips/t/payments')));
  });

  it('wpisuje i odhacza tylko organizator', async () => {
    const paid = {
      name: 'Ania',
      items: [
        {
          id: 'p1',
          title: 'Lot',
          amount: 3200,
          currency: 'PLN',
          paidOn: '2026-11-10',
        },
      ],
    };
    await assertFails(setDoc(doc(as('ania'), 'trips/t/payments/ania'), paid));
    await assertSucceeds(setDoc(doc(as('jacek'), 'trips/t/payments/ania'), paid));
    await assertFails(
      setDoc(doc(as('jacek'), 'trips/t/payments/bartek'), {
        name: 'Bartek',
        items: 'x',
      }),
    );
    await assertSucceeds(deleteDoc(doc(as('jacek'), 'trips/t/payments/ania')));
  });
});
