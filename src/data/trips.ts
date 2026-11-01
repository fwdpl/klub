import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { readDoc, readDocs } from './read';
import {
  SCHEMA_VERSION,
  type Audience,
  type ChecklistDoc,
  type DayDoc,
  type InfoDoc,
  type MemberDoc,
  type MemberStatus,
  type OverviewDoc,
  type TripDoc,
  type TripStatus,
  type UserDoc,
} from '../model/types';

// Dostęp do wyjazdów. Każde zapytanie musi być zgodne z firestore.rules (reguły nie są filtrami).

export type Trip = TripDoc & { id: string };
export type Member = MemberDoc & { id: string };
export type Person = UserDoc & { uid: string };

const STATUS_ORDER: Record<TripStatus, number> = { open: 0, closed: 1, draft: 2, archived: 3 };

export const TRIP_STATUS_LABEL: Record<TripStatus, string> = {
  draft: 'szkic',
  open: 'zapisy otwarte',
  closed: 'zapisy wstrzymane',
  archived: 'archiwum',
};

export const MEMBER_STATUS_LABEL: Record<MemberStatus, string> = {
  interested: 'zgłoszenie',
  approved: 'zatwierdzony udział',
  withdrawn: 'rezygnacja',
};

/** Moje statusy na wszystkich wyjazdach: tripId → status. */
export async function myMemberships(uid: string): Promise<Map<string, MemberStatus>> {
  const snap = await readDocs(query(collectionGroup(db, 'members'), where('uid', '==', uid)));
  return new Map(snap.docs.map((d) => [d.ref.parent.parent!.id, d.get('status') as MemberStatus]));
}

/** Wyjazdy widoczne dla osoby: organizator – wszystkie; uczestnik – otwarte, zamknięte i archiwum, na którym był. */
export async function listTrips(isOrganizer: boolean, memberships: Map<string, MemberStatus>): Promise<Trip[]> {
  const toTrip = (d: { id: string; data: () => unknown }) => ({ id: d.id, ...(d.data() as TripDoc) });
  let trips: Trip[];
  if (isOrganizer) {
    trips = (await readDocs(collection(db, 'trips'))).docs.map(toTrip);
  } else {
    const visible = await readDocs(query(collection(db, 'trips'), where('status', 'in', ['open', 'closed'])));
    trips = visible.docs.map(toTrip);
    const seen = new Set(trips.map((t) => t.id));
    const archivedIds = [...memberships].filter(([id, s]) => s === 'approved' && !seen.has(id)).map(([id]) => id);
    const archived = await Promise.all(archivedIds.map((id) => readDoc(doc(db, 'trips', id)).catch(() => null)));
    archived.forEach((d) => {
      if (d?.exists() && d.get('status') === 'archived') trips.push(toTrip(d));
    });
  }
  return trips.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.title.localeCompare(b.title, 'pl'));
}

export async function getTrip(id: string): Promise<Trip | null> {
  const d = await readDoc(doc(db, 'trips', id));
  return d.exists() ? { id: d.id, ...(d.data() as TripDoc) } : null;
}

export async function getOverview(tripId: string): Promise<OverviewDoc | null> {
  const d = await readDoc(doc(db, 'trips', tripId, 'overview', 'main'));
  return d.exists() ? (d.data() as OverviewDoc) : null;
}

/** Własny wpis – czytelny zawsze, także bez dostępu do listy osób. */
export async function getMyStatus(tripId: string, uid: string): Promise<MemberStatus | undefined> {
  const d = await readDoc(doc(db, 'trips', tripId, 'members', uid)).catch(() => null);
  return d?.exists() ? (d.get('status') as MemberStatus) : undefined;
}

export async function listMembers(tripId: string): Promise<Member[]> {
  const snap = await readDocs(collection(db, 'trips', tripId, 'members'));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as MemberDoc) }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'pl'));
}

/** „Też tam chcę” – reguły wymagają imienia z users i czasu serwera. */
export function joinTrip(tripId: string, uid: string, displayName: string): Promise<void> {
  return setDoc(doc(db, 'trips', tripId, 'members', uid), { uid, displayName, status: 'interested', updatedAt: serverTimestamp() });
}

export function leaveTrip(tripId: string, uid: string): Promise<void> {
  return deleteDoc(doc(db, 'trips', tripId, 'members', uid));
}

// ---------- organizator ----------

export interface TripForm {
  title: string;
  destination: string;
  approxDates: string;
  description: string;
  timezone: string;
  status: TripStatus;
  planSummary: string;
  costEstimate: string;
  decisionDeadline: string;
}

/** Zapis opisu (warstwa 1) i ogólnego planu (warstwa 2) jednym ruchem. Zwraca id wyjazdu. */
export async function saveTrip(id: string | null, form: TripForm): Promise<string> {
  const tripRef = id ? doc(db, 'trips', id) : doc(collection(db, 'trips'));
  const batch = writeBatch(db);
  const trip: TripDoc & { updatedAt: unknown } = {
    title: form.title.trim(),
    destination: form.destination.trim(),
    approxDates: form.approxDates.trim(),
    description: form.description.trim(),
    timezone: form.timezone,
    status: form.status,
    schemaVersion: SCHEMA_VERSION,
    updatedAt: serverTimestamp(),
  };
  batch.set(tripRef, trip, { merge: true });
  const overview: OverviewDoc = {
    planSummary: form.planSummary.trim(),
    costEstimate: form.costEstimate.trim(),
    ...(form.decisionDeadline ? { decisionDeadline: form.decisionDeadline } : {}),
  };
  batch.set(doc(db, 'trips', tripRef.id, 'overview', 'main'), overview);
  await batch.commit();
  return tripRef.id;
}

export function setMemberStatus(tripId: string, uid: string, status: MemberStatus): Promise<void> {
  return updateDoc(doc(db, 'trips', tripId, 'members', uid), { status, updatedAt: serverTimestamp() });
}

/** Dopisanie osoby, która potwierdziła udział poza aplikacją – od razu zatwierdzona. */
export function addApprovedMember(tripId: string, person: Pick<Person, 'uid' | 'displayName'>): Promise<void> {
  return setDoc(doc(db, 'trips', tripId, 'members', person.uid), {
    uid: person.uid,
    displayName: person.displayName,
    status: 'approved',
    updatedAt: serverTimestamp(),
  });
}

export async function listActivePeople(): Promise<Person[]> {
  const snap = await readDocs(collection(db, 'users'));
  return snap.docs
    .map((d) => ({ uid: d.id, ...(d.data() as UserDoc) }))
    .filter((p) => p.active)
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'pl'));
}

// ---------- szczegóły (warstwa 3) i checklisty ----------

export const EMPTY_INFO: InfoDoc = { flights: [], hotels: [], emergencyContacts: [], insurance: '', checklistTemplate: [] };

export async function getInfo(tripId: string): Promise<InfoDoc> {
  const d = await readDoc(doc(db, 'trips', tripId, 'info', 'main'));
  return d.exists() ? { ...EMPTY_INFO, ...(d.data() as Partial<InfoDoc>) } : EMPTY_INFO;
}

export function saveInfo(tripId: string, info: InfoDoc): Promise<void> {
  return setDoc(doc(db, 'trips', tripId, 'info', 'main'), { ...info, updatedAt: serverTimestamp() });
}

export async function getChecklist(tripId: string, uid: string): Promise<ChecklistDoc> {
  const d = await readDoc(doc(db, 'trips', tripId, 'checklists', uid));
  const data = d.exists() ? (d.data() as Partial<ChecklistDoc>) : {};
  return { templateDone: data.templateDone ?? {}, items: data.items ?? [] };
}

export function saveChecklist(tripId: string, uid: string, checklist: ChecklistDoc): Promise<void> {
  return setDoc(doc(db, 'trips', tripId, 'checklists', uid), { ...checklist, updatedAt: serverTimestamp() });
}

/** Pozycja dla tej osoby: wspólna albo z nią na liście „dla kogo” (decyzja G). */
export function isFor(audience: Audience, uid: string): boolean {
  return audience === 'all' || audience.includes(uid);
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ---------- plan dni (warstwa 3) ----------

export async function listDays(tripId: string): Promise<DayDoc[]> {
  const snap = await readDocs(collection(db, 'trips', tripId, 'days'));
  return snap.docs.map((d) => d.data() as DayDoc).sort((a, b) => a.date.localeCompare(b.date));
}

/** Import: zastępuje tylko dni z pliku (decyzja I) i uwagi do planu. */
export async function saveImportedPlan(tripId: string, days: DayDoc[], planNotes: string[]): Promise<void> {
  const info = await getInfo(tripId);
  const batch = writeBatch(db);
  for (const day of days) batch.set(doc(db, 'trips', tripId, 'days', day.date), { ...day, updatedAt: serverTimestamp() });
  batch.set(doc(db, 'trips', tripId, 'info', 'main'), { ...info, planNotes, updatedAt: serverTimestamp() });
  await batch.commit();
}

/** Ręczna zmiana jednego dnia (decyzja H): zapis całego dokumentu dnia. */
export function saveDay(tripId: string, day: DayDoc): Promise<void> {
  return setDoc(doc(db, 'trips', tripId, 'days', day.date), { ...day, updatedAt: serverTimestamp() });
}
