import { collection, doc, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { readDoc, readDocs } from './read';

// Potwierdzenia odczytu (v2, 5.11.2026): trips/{id}/changes/{changeId} zapisuje funkcja notifyTrip,
// odczyt osoby – trips/{id}/changes/{changeId}/reads/{uid} (reguły: firestore.rules, testy: tests/rules/changes.test.ts).

export interface Change {
  id: string;
  tripId: string;
  title: string;
  body: string;
  audience: 'approved' | 'interested';
  requireAck: boolean;
  at: Date | null;
}

export interface ReadState {
  seenAt: Date | null;
  ackAt: Date | null;
  name?: string;
}

const toDate = (v: unknown) => (v instanceof Timestamp ? v.toDate() : null);
const changesOf = (tripId: string) => collection(db, 'trips', tripId, 'changes');

/** Zmiany wyjazdu, które ta osoba może widzieć (organizator – wszystkie), od najnowszej. */
export async function listChanges(tripId: string, who: 'organizer' | 'approved' | 'interested'): Promise<Change[]> {
  const q = who === 'organizer' ? changesOf(tripId) : query(changesOf(tripId), where('audience', 'in', who === 'approved' ? ['approved', 'interested'] : ['interested']));
  const snap = await readDocs(q);
  return snap.docs
    .map((d) => {
      const x = d.data();
      return { id: d.id, tripId, title: x.title ?? '', body: x.body ?? '', audience: x.audience, requireAck: x.requireAck === true, at: toDate(x.createdAt) };
    })
    .sort((a, b) => (b.at?.getTime() ?? Infinity) - (a.at?.getTime() ?? Infinity));
}

export async function myRead(c: Change, uid: string): Promise<ReadState | null> {
  const snap = await readDoc(doc(changesOf(c.tripId), c.id, 'reads', uid)).catch(() => null);
  if (!snap?.exists()) return null;
  return { seenAt: toDate(snap.get('seenAt')), ackAt: toDate(snap.get('ackAt')) };
}

/** Organizator: odczyty wszystkich (klucz = uid). */
export async function listReads(c: Change): Promise<Map<string, ReadState>> {
  const snap = await readDocs(collection(changesOf(c.tripId), c.id, 'reads'));
  return new Map(snap.docs.map((d) => [d.id, { seenAt: toDate(d.get('seenAt')), ackAt: toDate(d.get('ackAt')), name: d.get('name') }]));
}

/** „Zobaczone” – zapis bez czekania na serwer (bez sieci wyśle się po połączeniu). */
export function markSeen(c: Change, me: { uid: string; displayName: string }, ack = false): Promise<void> {
  return setDoc(doc(changesOf(c.tripId), c.id, 'reads', me.uid), { seenAt: serverTimestamp(), name: me.displayName, ...(ack ? { ackAt: serverTimestamp() } : {}) });
}

export function markAck(c: Change, uid: string): Promise<void> {
  return updateDoc(doc(changesOf(c.tripId), c.id, 'reads', uid), { ackAt: serverTimestamp() });
}
