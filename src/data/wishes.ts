import { collection, deleteDoc, deleteField, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Priority, Wish } from '../wishes/wishes';
import { readDoc, readDocs } from './read';

// Lista życzeń: trips/{tripId}/wishes/{wishId} (reguły w firestore.rules, testy w tests/rules/wishes.test.ts).

export type WishDetails = Pick<Wish, 'name' | 'place' | 'link' | 'preferredTime' | 'durationMin' | 'fixedTime' | 'note'>;

const wishesOf = (tripId: string) => collection(db, 'trips', tripId, 'wishes');

export async function listWishes(tripId: string): Promise<Wish[]> {
  const snap = await readDocs(wishesOf(tripId));
  return snap.docs.map((d) => { const data = d.data() as Omit<Wish, 'id'>; return { ...data, id: d.id, votes: data.votes ?? {} }; });
}

/** Bez pustych pól – w bazie zostaje tylko to, co wpisano. */
function clean(details: WishDetails): WishDetails {
  return Object.fromEntries(Object.entries(details).filter(([, v]) => v !== undefined && v !== '' && v !== null)) as WishDetails;
}

/**
 * Dodaje miejsce z moim głosem. Gdy to samo miejsce już jest (ten sam identyfikator) – dopisuje tylko mój głos.
 * Zwraca, czy miejsce było nowe.
 */
export async function addWish(tripId: string, id: string, details: WishDetails, me: { uid: string; displayName: string }, priority: Priority): Promise<boolean> {
  const ref = doc(wishesOf(tripId), id);
  const existing = await readDoc(ref).catch(() => null);
  const vote = { name: me.displayName, priority };
  if (existing?.exists()) {
    await updateDoc(ref, { [`votes.${me.uid}`]: vote });
    return false;
  }
  await setDoc(ref, { ...clean(details), addedBy: me.uid, addedByName: me.displayName, createdAt: serverTimestamp(), votes: { [me.uid]: vote } });
  return true;
}

export function setVote(tripId: string, id: string, me: { uid: string; displayName: string }, priority: Priority | null): Promise<void> {
  return updateDoc(doc(wishesOf(tripId), id), { [`votes.${me.uid}`]: priority ? { name: me.displayName, priority } : deleteField() });
}

export function updateWish(tripId: string, id: string, details: WishDetails): Promise<void> {
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(details)) fields[k] = v === undefined || v === '' ? deleteField() : v;
  return updateDoc(doc(wishesOf(tripId), id), fields);
}

export function deleteWish(tripId: string, id: string): Promise<void> {
  return deleteDoc(doc(wishesOf(tripId), id));
}
