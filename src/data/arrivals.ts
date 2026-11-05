import { addDoc, collection, query, serverTimestamp, Timestamp, where } from 'firebase/firestore';
import { db } from '../firebase';
import { readDocs } from './read';

// „Jestem na miejscu”: trips/{id}/arrivals/{id} (reguły w firestore.rules, testy w tests/rules/arrivals.test.ts).
// Powiadomienie wysyła funkcja onArrival. Bez internetu wpis czeka w kolejce i wysyła się po połączeniu.

export type ArrivalTo = 'all' | 'organizer';

export interface Arrival {
  id: string;
  uid: string;
  name: string;
  to: ArrivalTo;
  note?: string;
  at: Date | null; // null – jeszcze nie zapisane na serwerze
}

const arrivalsOf = (tripId: string) => collection(db, 'trips', tripId, 'arrivals');

export function sendArrival(tripId: string, me: { uid: string; displayName: string }, to: ArrivalTo, note: string): Promise<unknown> {
  const text = note.trim().slice(0, 80);
  return addDoc(arrivalsOf(tripId), { uid: me.uid, name: me.displayName, to, ...(text ? { note: text } : {}), createdAt: serverTimestamp() });
}

/** Ostatnie wpisy, które ta osoba może widzieć (organizator – wszystkie; inni – „do wszystkich” i własne). */
export async function listArrivals(tripId: string, uid: string, isOrganizer: boolean): Promise<Arrival[]> {
  const snaps = isOrganizer
    ? [await readDocs(arrivalsOf(tripId))]
    : await Promise.all([readDocs(query(arrivalsOf(tripId), where('to', '==', 'all'))), readDocs(query(arrivalsOf(tripId), where('uid', '==', uid)))]);
  const byId = new Map<string, Arrival>();
  for (const snap of snaps) {
    for (const d of snap.docs) {
      const data = d.data();
      const at = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null;
      byId.set(d.id, { id: d.id, uid: data.uid, name: data.name, to: data.to, ...(data.note ? { note: data.note } : {}), at });
    }
  }
  return [...byId.values()].sort((a, b) => (b.at?.getTime() ?? Infinity) - (a.at?.getTime() ?? Infinity));
}
