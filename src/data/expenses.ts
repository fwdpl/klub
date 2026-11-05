import { collection, deleteDoc, deleteField, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Expense } from '../expenses/expenses';
import type { PaymentsDoc } from '../expenses/payments';
import { readDoc, readDocs } from './read';

// Wspólne wydatki: trips/{id}/expenses/{expenseId}; wpłaty: trips/{id}/payments/{uid}
// (reguły w firestore.rules, testy w tests/rules/expenses.test.ts).
// Zapis bez internetu czeka w kolejce Firestore i wysyła się po połączeniu – ekran nie czeka na serwer.

export type ExpenseInput = Omit<Expense, 'id' | 'createdBy'>;

const expensesOf = (tripId: string) => collection(db, 'trips', tripId, 'expenses');
const paymentsOf = (tripId: string) => collection(db, 'trips', tripId, 'payments');

export async function listExpenses(tripId: string): Promise<Expense[]> {
  const snap = await readDocs(expensesOf(tripId));
  return snap.docs.map((d) => ({
    ...(d.data() as Omit<Expense, 'id'>),
    id: d.id,
  }));
}

const clean = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '')) as T;

/** Nowy wydatek: identyfikator nadany od razu, więc działa też bez sieci. Zwraca wpis i obietnicę zapisu na serwerze. */
export function addExpense(tripId: string, uid: string, input: ExpenseInput): { expense: Expense; saved: Promise<void> } {
  const ref = doc(expensesOf(tripId));
  const data = clean({ ...input, createdBy: uid });
  return {
    expense: { ...data, id: ref.id },
    saved: setDoc(ref, {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  };
}

export function updateExpense(tripId: string, id: string, input: ExpenseInput): Promise<void> {
  const data: Record<string, unknown> = {
    ...input,
    updatedAt: serverTimestamp(),
  };
  // puste pola opcjonalne znikają z dokumentu
  for (const k of ['category', 'note'] as const) if (!input[k]) data[k] = deleteField();
  return updateDoc(doc(expensesOf(tripId), id), data);
}

export function deleteExpense(tripId: string, id: string): Promise<void> {
  return deleteDoc(doc(expensesOf(tripId), id));
}

// ---------- wpłaty ----------

export async function getMyPayments(tripId: string, uid: string): Promise<PaymentsDoc | null> {
  const snap = await readDoc(doc(paymentsOf(tripId), uid));
  return snap.exists() ? (snap.data() as PaymentsDoc) : null;
}

/** Organizator: wpłaty wszystkich (klucz = uid). */
export async function listPayments(tripId: string): Promise<Map<string, PaymentsDoc>> {
  const snap = await readDocs(paymentsOf(tripId));
  return new Map(snap.docs.map((d) => [d.id, d.data() as PaymentsDoc]));
}

export function savePayments(tripId: string, uid: string, payments: PaymentsDoc): Promise<void> {
  return setDoc(doc(paymentsOf(tripId), uid), {
    name: payments.name,
    items: payments.items.map(clean),
    updatedAt: serverTimestamp(),
  });
}
