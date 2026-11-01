import type { PushMessage } from './push.js';

interface MemberSnapshot {
  status?: string;
  displayName?: string;
}

export interface MemberNotifications {
  toOrganizers?: PushMessage;
  toMember?: PushMessage;
}

/**
 * Powiadomienia o zmianie statusu osoby przy wyjeździe.
 * - Zmiana zrobiona przez samą osobę („też tam chcę”, wycofanie) → organizator (decyzja z 31.10.2026).
 * - Zmiana zrobiona przez organizatora (zatwierdzenie, rezygnacja, przywrócenie) → ta osoba (decyzja D z 1.11.2026).
 */
export function memberNotifications(
  before: MemberSnapshot | undefined,
  after: MemberSnapshot | undefined,
  tripTitle: string,
  byMember: boolean,
): MemberNotifications {
  const name = after?.displayName ?? before?.displayName ?? 'Ktoś';

  if (byMember) {
    if (!before && after?.status === 'interested') {
      return { toOrganizers: { title: 'Nowe zgłoszenie', body: `${name} chce jechać: ${tripTitle}` } };
    }
    if (before?.status === 'interested' && !after) {
      return { toOrganizers: { title: 'Wycofane zgłoszenie', body: `${name} rezygnuje z: ${tripTitle}` } };
    }
    return {};
  }

  if (!after || after.status === before?.status) return {};
  switch (after.status) {
    case 'approved':
      return { toMember: { title: 'Jesteś na liście uczestników', body: tripTitle } };
    case 'withdrawn':
      return { toMember: { title: 'Wpisano rezygnację', body: `${tripTitle} – nie jesteś już na liście uczestników.` } };
    case 'interested':
      return before ? { toMember: { title: 'Przywrócono zgłoszenie', body: tripTitle } } : {};
    default:
      return {};
  }
}
