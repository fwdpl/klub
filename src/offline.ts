import { getChecklist, getInfo, getOverview, getTrip, listDays, listMembers, listTrips, myMemberships } from './data/trips';

// Tryb offline (SPEC §5): Firestore trzyma odczytane dane w trwałej pamięci telefonu.
// Pobranie wyjazdu odczytuje z serwera wszystko, co osoba może przy nim zobaczyć (i listę wyjazdów),
// więc później te same ekrany działają bez internetu. Zapisy bez sieci czekają w kolejce Firestore.

const syncKey = (uid: string, tripId: string) => `klub.lastSync.${uid}.${tripId}`;

export function lastSync(uid: string, tripId: string): Date | null {
  try {
    const v = localStorage.getItem(syncKey(uid, tripId));
    return v ? new Date(v) : null;
  } catch {
    return null;
  }
}

export function formatSync(date: Date): string {
  const time = date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === new Date().toDateString()) return `dziś ${time}`;
  return `${date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })}, ${time}`;
}

/** Pobiera na telefon jeden wyjazd: wszystkie warstwy widoczne dla osoby, jej checklistę i listę wyjazdów. */
export async function downloadTrip(uid: string, tripId: string, isOrganizer: boolean): Promise<void> {
  const memberships = await myMemberships(uid);
  const status = memberships.get(tripId);
  const seesOverview = isOrganizer || status === 'interested' || status === 'approved';
  const seesDetails = isOrganizer || status === 'approved';
  const reads: Promise<unknown>[] = [getTrip(tripId), listTrips(isOrganizer, memberships)];
  if (seesOverview) reads.push(getOverview(tripId), listMembers(tripId));
  if (seesDetails) reads.push(getInfo(tripId), listDays(tripId));
  if (status === 'approved') reads.push(getChecklist(tripId, uid));
  await Promise.all(reads);
  try {
    localStorage.setItem(syncKey(uid, tripId), new Date().toISOString());
  } catch {
    // bez pamięci urządzenia data pobrania nie będzie widoczna – dane i tak są w pamięci Firestore
  }
}

/** Pasek „Bez internetu” na górze ekranu. */
export function watchConnection(): void {
  const bar = document.getElementById('offline') as HTMLElement;
  bar.textContent = 'Bez internetu – pokazuję dane zapisane na telefonie. Zmiany wyślą się po połączeniu.';
  const update = () => (bar.hidden = navigator.onLine);
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}
