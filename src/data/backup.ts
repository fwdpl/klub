import { collection, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { readDocs } from './read';

// Eksport kopii danych przez organizatora (SPEC §5, panel organizatora). Plik JSON zapisany na urządzeniu.
// Bez tokenów powiadomień – to identyfikatory telefonów, nie dane wyjazdu, i po odtworzeniu i tak byłyby nieważne.

export const BACKUP_FORMAT = 'klub-backup';
export const BACKUP_VERSION = '1.0';

type Plain = Record<string, unknown>;

/** Znaczniki czasu Firestore jako tekst ISO – czytelne i niezależne od biblioteki. */
export function toPlain(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(toPlain);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Plain).map(([k, v]) => [k, toPlain(v)]));
  }
  return value;
}

async function docsOf(...path: [string, ...string[]]): Promise<Record<string, unknown>> {
  const snap = await readDocs(collection(db, ...path));
  return Object.fromEntries(snap.docs.map((d) => [d.id, toPlain(d.data())]));
}

const TRIP_COLLECTIONS = ['overview', 'members', 'info', 'days', 'checklists'] as const;

export async function buildBackup(appVersion: string): Promise<Plain> {
  const users = await docsOf('users');
  for (const user of Object.values(users) as Plain[]) delete user.fcmTokens;

  const trips = await docsOf('trips');
  const withParts = await Promise.all(
    Object.entries(trips).map(async ([id, trip]) => {
      const parts = await Promise.all(TRIP_COLLECTIONS.map(async (name) => [name, await docsOf('trips', id, name)] as const));
      return [id, { ...(trip as Plain), ...Object.fromEntries(parts) }] as const;
    }),
  );

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    appVersion,
    users,
    trips: Object.fromEntries(withParts),
  };
}

export function backupFileName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `klub-kopia-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.json`;
}

/** Zapis pliku na urządzeniu (pobranie w przeglądarce, na iPhonie – arkusz „Zachowaj w Plikach”). */
export function saveFile(name: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
