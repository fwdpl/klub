import type { DayDoc, PlanItem } from '../model/types';
import { itemInterval, sortItems } from './collisions';

// Eksport planu do kalendarza telefonu (plik iCalendar, RFC 5545) – lista „Szybko po v1”.
// Źródłem prawdy zostaje czas lokalny miejsca + strefa; chwile w UTC powstają tylko w pliku eksportu,
// a kalendarz pokazuje je w strefie telefonu (po przylocie – w czasie miejsca).

export interface IcsInput {
  tripId: string;
  tripTitle: string;
  tripZone: string;
  days: DayDoc[];
  /** Które punkty: np. „Mój plan” (wspólne + moje). */
  include: (item: PlanItem) => boolean;
  /** Przypomnienie przed punktem w minutach; 0 = bez przypomnienia. */
  reminderMinutes: number;
  now?: Date;
}

const DEFAULT_MINUTES = 30; // punkt bez końca – w kalendarzu jako 30 min

function utc(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Znaki specjalne wartości tekstowych iCalendar. */
export function escapeText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Zawijanie linii do 75 bajtów UTF-8 (kontynuacja zaczyna się od spacji), bez dzielenia znaków. */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // kontynuacja ma spację na początku
    if (bytes + size > limit) {
      out.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join('\r\n ');
}

const plain = (text: string) => text.replace(/\*\*([^*]+)\*\*/g, '$1');

function eventLines(item: PlanItem, day: DayDoc, input: IcsInput, stamp: string): string[] {
  const zone = day.timezone ?? input.tripZone;
  const { start, end } = itemInterval(item, zone);
  const finish = end > start ? end : start + DEFAULT_MINUTES * 60_000;
  const location = item.place ? [item.place.name, item.place.address].filter(Boolean).join(', ') : '';
  const description = [
    item.notes && plain(item.notes),
    item.route && `Dojazd: ${plain(item.route)}`,
    item.meet && `Spotkanie: ${item.meet.place}${item.meet.time ? ` – ${item.meet.time.slice(11, 16)}` : ''}`,
    input.tripTitle,
  ]
    .filter(Boolean)
    .join('\n');
  const lines = [
    'BEGIN:VEVENT',
    `UID:${input.tripId}-${day.date}-${item.id}@klub.bakutis.pl`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${utc(start)}`,
    `DTEND:${utc(finish)}`,
    `SUMMARY:${escapeText(`${item.important ? '❗ ' : ''}${item.title}`)}`,
    location && `LOCATION:${escapeText(location)}`,
    description && `DESCRIPTION:${escapeText(description)}`,
  ].filter((l): l is string => !!l);
  if (input.reminderMinutes > 0) {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(item.title)}`, `TRIGGER:-PT${input.reminderMinutes}M`, 'END:VALARM');
  }
  lines.push('END:VEVENT');
  return lines;
}

/** Plik .ics z punktami planu; zwraca też liczbę wydarzeń. */
export function buildIcs(input: IcsInput): { ics: string; count: number } {
  const stamp = utc((input.now ?? new Date()).getTime());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Klub//Plan wyjazdu//PL', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escapeText(input.tripTitle)}`];
  let count = 0;
  for (const day of [...input.days].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const item of sortItems(day.items, day.timezone ?? input.tripZone)) {
      if (!input.include(item)) continue;
      lines.push(...eventLines(item, day, input, stamp));
      count++;
    }
  }
  lines.push('END:VCALENDAR');
  return { ics: lines.map(foldLine).join('\r\n') + '\r\n', count };
}

export function icsFileName(tripTitle: string): string {
  const slug = tripTitle
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `klub-${slug || 'plan'}.ics`;
}
