import type { PlanItem } from '../model/types';
import { toInstant } from './time';

export interface Interval {
  start: number;
  end: number; // == start dla punktu bez czasu końca
}

export function itemInterval(item: PlanItem, dayZone: string): Interval {
  const startZone = item.tz ?? dayZone;
  const start = toInstant(item.start, startZone);
  const end = item.end ? toInstant(item.end, item.endTz ?? startZone) : start;
  return { start, end: Math.max(start, end) };
}

/** Punkt (bez końca) koliduje, gdy leży wewnątrz przedziału; dwa przedziały – gdy na siebie nachodzą. */
export function overlaps(a: Interval, b: Interval): boolean {
  if (a.start === a.end && b.start === b.end) return a.start === b.start;
  if (a.start === a.end) return b.start <= a.start && a.start < b.end;
  if (b.start === b.end) return a.start <= b.start && b.start < a.end;
  return a.start < b.end && b.start < a.end;
}

/**
 * Kolizje w planie jednej osoby: punkt prywatny (dla wybranych osób) nachodzący na punkt wspólny (SPEC §5).
 * Zwraca identyfikatory punktów prywatnych z kolizją i opis, z czym kolidują.
 */
export function findCollisions(items: PlanItem[], uid: string, dayZone: string): Map<string, string> {
  const mine = items.filter((i) => i.audience !== 'all' && i.audience.includes(uid));
  const shared = items.filter((i) => i.audience === 'all');
  const result = new Map<string, string>();
  for (const p of mine) {
    const pi = itemInterval(p, dayZone);
    const hit = shared.find((s) => overlaps(pi, itemInterval(s, dayZone)));
    if (hit) result.set(p.id, hit.title);
  }
  return result;
}

/** Kolejność na osi czasu: według chwili rozpoczęcia, nie według napisu (strefy mogą się różnić). */
export function sortItems(items: PlanItem[], dayZone: string): PlanItem[] {
  return [...items].sort((a, b) => itemInterval(a, dayZone).start - itemInterval(b, dayZone).start);
}
