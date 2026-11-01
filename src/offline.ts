import { getChecklist, getInfo, getOverview, listDays, listMembers, listTrips, myMemberships } from './data/trips';

// Tryb offline (SPEC §5): Firestore trzyma odczytane dane w trwałej pamięci telefonu.
// „Pobierz wszystko na wyjazd” odczytuje z serwera wszystko, co osoba może zobaczyć,
// więc później te same ekrany działają bez internetu. Zapisy bez sieci czekają w kolejce Firestore.

const syncKey = (uid: string) => `klub.lastSync.${uid}`;

export function lastSync(uid: string): Date | null {
  try {
    const v = localStorage.getItem(syncKey(uid));
    return v ? new Date(v) : null;
  } catch {
    return null;
  }
}

export function formatSync(date: Date | null): string {
  if (!date) return 'jeszcze nie pobrano';
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  const time = date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  return sameDay ? `dziś ${time}` : `${date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })}, ${time}`;
}

/** Pobiera wszystkie warstwy wszystkich wyjazdów widocznych dla osoby. Zwraca liczbę wyjazdów. */
export async function downloadAll(uid: string, isOrganizer: boolean): Promise<number> {
  const memberships = await myMemberships(uid);
  const trips = await listTrips(isOrganizer, memberships);
  await Promise.all(
    trips.map(async (trip) => {
      const status = memberships.get(trip.id);
      const seesOverview = isOrganizer || status === 'interested' || status === 'approved';
      const seesDetails = isOrganizer || status === 'approved';
      const reads: Promise<unknown>[] = [];
      if (seesOverview) reads.push(getOverview(trip.id), listMembers(trip.id));
      if (seesDetails) reads.push(getInfo(trip.id), listDays(trip.id));
      if (status === 'approved') reads.push(getChecklist(trip.id, uid));
      await Promise.all(reads);
    }),
  );
  try {
    localStorage.setItem(syncKey(uid), new Date().toISOString());
  } catch {
    // bez pamięci urządzenia data synchronizacji nie będzie widoczna – dane i tak są w pamięci Firestore
  }
  return trips.length;
}

/** Pasek „Bez internetu” na górze ekranu. Zwraca odświeżenie – do wywołania po zmianie zalogowanej osoby. */
export function watchConnection(currentUid: () => string | null): () => void {
  const bar = document.getElementById('offline') as HTMLElement;
  const update = () => {
    const uid = currentUid();
    bar.hidden = navigator.onLine;
    bar.textContent = `Bez internetu – dane z: ${uid ? formatSync(lastSync(uid)) : '—'}. Zmiany wyślą się po połączeniu.`;
  };
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
  return update;
}
