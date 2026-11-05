import { collection, deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { newId } from './trips';
import { readDoc, readDocs } from './read';

// Kierunki do rozważenia (v2, 5.11.2026): destinations/{id} prowadzi organizator; destinations/{id}/interest/{uid} –
// „interesuje mnie” (osoba widzi tylko swoje, organizator wszystkich). Reguły: firestore.rules.

export interface Destination {
  id: string;
  name: string;
  dates?: string; // np. „wiosna 2027”
  sortDate?: string; // 'YYYY-MM' – do sortowania „wg terminu”
  note?: string;
}

const destinations = collection(db, 'destinations');

export async function listDestinations(): Promise<Destination[]> {
  const snap = await readDocs(destinations);
  return snap.docs.map((d) => ({ ...(d.data() as Omit<Destination, 'id'>), id: d.id }));
}

export function saveDestination(id: string | null, d: Omit<Destination, 'id'>): Promise<void> {
  const clean = Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined && v !== ''));
  return setDoc(doc(destinations, id ?? newId()), { ...clean, createdAt: serverTimestamp() });
}

export function deleteDestination(id: string): Promise<void> {
  return deleteDoc(doc(destinations, id));
}

export async function myInterest(id: string, uid: string): Promise<boolean> {
  const snap = await readDoc(doc(destinations, id, 'interest', uid)).catch(() => null);
  return !!snap?.exists();
}

export function setInterest(id: string, me: { uid: string; displayName: string }, on: boolean): Promise<void> {
  const ref = doc(destinations, id, 'interest', me.uid);
  return on ? setDoc(ref, { name: me.displayName, at: serverTimestamp() }) : deleteDoc(ref);
}

/** Organizator: kto zaznaczył (imiona). */
export async function interestedNames(id: string): Promise<string[]> {
  const snap = await readDocs(collection(destinations, id, 'interest'));
  return snap.docs.map((d) => String(d.get('name') ?? '?')).sort((a, b) => a.localeCompare(b, 'pl'));
}

/** Sortowanie: alfabetycznie albo wg terminu (bez terminu – na końcu, alfabetycznie). */
export function sortDestinations(list: Destination[], by: 'name' | 'date'): Destination[] {
  const byName = (a: Destination, b: Destination) => a.name.localeCompare(b.name, 'pl');
  if (by === 'name') return [...list].sort(byName);
  return [...list].sort((a, b) => (a.sortDate ?? '9999').localeCompare(b.sortDate ?? '9999') || byName(a, b));
}
