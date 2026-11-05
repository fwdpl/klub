// „Jestem na miejscu” (v2, decyzja Jacka z 5.11.2026): jeden ogólny przycisk przy wyjeździe;
// osoba wybiera, czy informacja idzie do wszystkich (zatwierdzeni + organizator), czy tylko do organizatora.
// Bez imiesłowów z rodzajem („dotarł/dotarła”) – tekst neutralny.

export type ArrivalAudience = 'all' | 'organizer';

export interface ArrivalPerson {
  uid: string;
  status?: string; // status przy wyjeździe (members)
  isOrganizer: boolean;
}

/** Kto dostaje powiadomienie: bez nadawcy; „do wszystkich” = zatwierdzeni i organizatorzy. */
export function arrivalRecipients(people: ArrivalPerson[], senderUid: string, to: ArrivalAudience): string[] {
  const out = people.filter((p) => p.uid !== senderUid && (p.isOrganizer || (to === 'all' && p.status === 'approved')));
  return [...new Set(out.map((p) => p.uid))];
}

export function arrivalMessage(name: string, tripTitle: string, note?: string): { title: string; body: string } {
  return { title: `📍 ${name} jest na miejscu`, body: note?.trim() ? `${note.trim()} · ${tripTitle}` : tripTitle };
}
