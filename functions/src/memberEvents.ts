import type { PushMessage } from './push.js';

interface MemberSnapshot {
  status?: string;
  displayName?: string;
}

/**
 * Powiadomienie dla organizatora o zmianie zgłoszenia przez uczestnika (decyzja z 31.10.2026).
 * Zmiany robione przez samego organizatora (zatwierdzenie, rezygnacja) odfiltrowuje wywołujący.
 */
export function organizerMessage(
  before: MemberSnapshot | undefined,
  after: MemberSnapshot | undefined,
  tripTitle: string,
): PushMessage | null {
  const name = after?.displayName ?? before?.displayName ?? 'Ktoś';
  if (!before && after?.status === 'interested') {
    return { title: 'Nowe zgłoszenie', body: `${name} chce jechać: ${tripTitle}` };
  }
  if (before?.status === 'interested' && !after) {
    return { title: 'Wycofane zgłoszenie', body: `${name} rezygnuje z: ${tripTitle}` };
  }
  return null;
}
