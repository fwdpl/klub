import type { DayDoc, Hotel, PlanItem } from '../model/types';
import { itemInterval, sortItems } from './collisions';
import { toInstant, todayIn } from './time';

// Ekran „Dziś” (lista „Szybko po v1”): co teraz, co dalej, zbiórka z odliczaniem, nocleg na dziś.
// Daty i godziny liczone w strefie miejsca (dnia), nie telefonu.

export interface Upcoming {
  item: PlanItem;
  start: number;
  end: number;
}

export interface TodayView {
  day: DayDoc;
  zone: string;
  /** Punkt, który właśnie trwa. */
  current?: Upcoming;
  /** Najbliższy punkt, który się jeszcze nie zaczął. */
  next?: Upcoming;
  /** Zbiórka najbliższego punktu (z godziną), jeśli jeszcze przed nami. */
  meet?: { place: string; at: number };
  /** Gdy na dziś nic nie zostało – pierwszy punkt następnego dnia planu. */
  tomorrow?: Upcoming & { day: DayDoc };
}

function entries(day: DayDoc, zone: string, include: (i: PlanItem) => boolean): Upcoming[] {
  return sortItems(day.items.filter(include), zone).map((item) => ({ item, ...itemInterval(item, zone) }));
}

/** Widok „Dziś” albo null, gdy dzisiejszej daty nie ma w planie (przed wyjazdem, po wyjeździe, dzień bez wpisu). */
export function todayView(days: DayDoc[], tripZone: string, include: (i: PlanItem) => boolean, now: Date = new Date()): TodayView | null {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const index = sorted.findIndex((d) => todayIn(d.timezone ?? tripZone, now) === d.date);
  if (index < 0) return null;
  const day = sorted[index];
  const zone = day.timezone ?? tripZone;
  const t = now.getTime();
  const list = entries(day, zone, include);
  const current = list.filter((e) => e.start <= t && t < Math.max(e.end, e.start + 1)).at(-1);
  const next = list.find((e) => e.start > t);
  const view: TodayView = { day, zone, ...(current ? { current } : {}), ...(next ? { next } : {}) };

  const meetOf = next?.item.meet?.time ? toInstant(next.item.meet.time, next.item.tz ?? zone) : NaN;
  if (next?.item.meet && meetOf > t) view.meet = { place: next.item.meet.place, at: meetOf };

  if (!next) {
    for (const later of sorted.slice(index + 1)) {
      const first = entries(later, later.timezone ?? tripZone, include)[0];
      if (first) {
        view.tomorrow = { ...first, day: later };
        break;
      }
    }
  }
  return view;
}

/** Nocleg na dziś: zameldowanie w dniu dzisiejszym albo wcześniej, wymeldowanie później niż dziś. */
export function hotelTonight(hotels: Hotel[], date: string): Hotel | undefined {
  return hotels.find((x) => x.checkIn && x.checkOut && x.checkIn.slice(0, 10) <= date && date < x.checkOut.slice(0, 10));
}

/** „za 5 min”, „za 1 godz. 20 min”, „za 2 dni”; przeszłość – „teraz”. */
export function countdown(ms: number): string {
  if (ms <= 30_000) return 'teraz';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `za ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `za ${hours} godz. ${rest} min` : `za ${hours} godz.`;
  const daysLeft = Math.round(hours / 24);
  return `za ${daysLeft} ${daysLeft === 1 ? 'dzień' : 'dni'}`;
}
