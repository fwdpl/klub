// Import planu z pliku JSON – format „klub-plan” w wersji 1.x (opis: docs/plan-format.md).
// Sprawdza cały plik i zwraca wszystkie błędy naraz, po polsku, z miejscem błędu.
// Nic nie zapisuje – zapis robi ekran importu po podglądzie.

import type { Audience, DayDoc, PlanItem, PlanItemType, PlanPlace, WeatherDependency } from '../model/types';
import { isValidDate, isValidLocal, isValidZone, toInstant } from './time';

export const PLAN_FORMAT = 'klub-plan';
export const PLAN_MAJOR_VERSION = 1;

export const ITEM_TYPES: PlanItemType[] = ['activity', 'meal', 'transport', 'flight', 'checkin', 'meeting', 'free'];
const WEATHER: WeatherDependency[] = ['beach', 'viewpoint', 'night-sky'];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_ITEMS_PER_DAY = 100;

export interface ImportContext {
  tripTitle: string;
  tripTimezone: string;
  /** Zatwierdzeni uczestnicy – „for” w pliku to ich imiona z aplikacji. */
  people: { uid: string; displayName: string }[];
}

export type ImportResult =
  | { ok: true; days: DayDoc[]; revision: number; warnings: string[] }
  | { ok: false; errors: string[] };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const nameKey = (s: string) => s.trim().toLocaleLowerCase('pl');

function makeId(date: string, index: number): string {
  return `${date.replace(/-/g, '')}-${String(index + 1).padStart(2, '0')}`;
}

export function parsePlanFile(text: string, ctx: ImportContext): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    return { ok: false, errors: [`To nie jest poprawny JSON: ${(err as Error).message}`] };
  }
  return validatePlan(data, ctx);
}

export function validatePlan(data: unknown, ctx: ImportContext): ImportResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isObject(data)) return { ok: false, errors: ['Plik musi być obiektem JSON ({ … }).'] };
  if (data.format !== PLAN_FORMAT) errors.push(`Pole „format” musi mieć wartość "${PLAN_FORMAT}".`);
  const version = typeof data.version === 'string' ? data.version : '';
  if (!/^\d+\.\d+$/.test(version)) errors.push('Pole „version” musi mieć postać "1.0".');
  else if (Number(version.split('.')[0]) !== PLAN_MAJOR_VERSION) {
    errors.push(`Wersja formatu ${version} nie jest obsługiwana – aplikacja czyta wersję ${PLAN_MAJOR_VERSION}.x.`);
  }
  const revision = data.revision;
  if (!Number.isInteger(revision) || (revision as number) < 1) errors.push('Pole „revision” musi być liczbą całkowitą ≥ 1.');
  if (typeof data.trip === 'string' && nameKey(data.trip) !== nameKey(ctx.tripTitle)) {
    warnings.push(`Plik jest opisany jako „${data.trip}”, a importujesz do wyjazdu „${ctx.tripTitle}”. Upewnij się, że to właściwy plik.`);
  }

  // imiona → uid; imię musi być jednoznaczne wśród zatwierdzonych
  const byName = new Map<string, string[]>();
  for (const p of ctx.people) byName.set(nameKey(p.displayName), [...(byName.get(nameKey(p.displayName)) ?? []), p.uid]);

  if (!Array.isArray(data.days) || data.days.length === 0) {
    errors.push('Pole „days” musi być niepustą listą dni.');
    return { ok: false, errors };
  }

  const seenDates = new Set<string>();
  const days: DayDoc[] = [];

  data.days.forEach((rawDay: unknown, di: number) => {
    const where = `Dzień ${di + 1}`;
    if (!isObject(rawDay)) {
      errors.push(`${where}: musi być obiektem.`);
      return;
    }
    const date = typeof rawDay.date === 'string' ? rawDay.date : '';
    const dayLabel = date ? `Dzień ${date}` : where;
    if (!isValidDate(date)) errors.push(`${where}: pole „date” musi być istniejącą datą w postaci RRRR-MM-DD.`);
    else if (seenDates.has(date)) errors.push(`${dayLabel}: ta data występuje w pliku więcej niż raz.`);
    seenDates.add(date);

    let dayZone = ctx.tripTimezone;
    if (rawDay.timezone !== undefined) {
      if (typeof rawDay.timezone !== 'string' || !isValidZone(rawDay.timezone)) {
        errors.push(`${dayLabel}: nieznana strefa czasowa „${String(rawDay.timezone)}” (np. "Atlantic/Reykjavik").`);
      } else dayZone = rawDay.timezone;
    }
    if (rawDay.weather !== undefined && !WEATHER.includes(rawDay.weather as WeatherDependency)) {
      errors.push(`${dayLabel}: „weather” może mieć wartość ${WEATHER.map((w) => `"${w}"`).join(', ')}.`);
    }
    if (!Array.isArray(rawDay.items)) {
      errors.push(`${dayLabel}: pole „items” musi być listą punktów (może być pusta).`);
      return;
    }
    if (rawDay.items.length > MAX_ITEMS_PER_DAY) errors.push(`${dayLabel}: najwyżej ${MAX_ITEMS_PER_DAY} punktów w dniu.`);

    const items: PlanItem[] = [];
    rawDay.items.forEach((raw: unknown, ii: number) => {
      const at = `${dayLabel}, punkt ${ii + 1}`;
      if (!isObject(raw)) {
        errors.push(`${at}: musi być obiektem.`);
        return;
      }
      const title = typeof raw.title === 'string' ? raw.title.trim() : '';
      const label = title ? `${at} („${title}”)` : at;
      if (!title || title.length > 120) errors.push(`${at}: „title” jest wymagany (do 120 znaków).`);

      const type = (raw.type ?? 'activity') as PlanItemType;
      if (!ITEM_TYPES.includes(type)) errors.push(`${label}: „type” może mieć wartość ${ITEM_TYPES.map((t) => `"${t}"`).join(', ')}.`);

      const time = typeof raw.time === 'string' ? raw.time : '';
      if (!TIME_RE.test(time)) errors.push(`${label}: „time” musi mieć postać GG:MM (np. "09:30").`);
      const start = `${date}T${time}`;

      let tz: string | undefined;
      if (raw.timezone !== undefined) {
        if (typeof raw.timezone !== 'string' || !isValidZone(raw.timezone)) errors.push(`${label}: nieznana strefa „${String(raw.timezone)}”.`);
        else if (raw.timezone !== dayZone) tz = raw.timezone;
      }
      let endTz: string | undefined;
      if (raw.endTimezone !== undefined) {
        if (typeof raw.endTimezone !== 'string' || !isValidZone(raw.endTimezone)) errors.push(`${label}: nieznana strefa „${String(raw.endTimezone)}”.`);
        else if (raw.endTimezone !== (tz ?? dayZone)) endTz = raw.endTimezone;
      }

      let end: string | undefined;
      if (raw.end !== undefined) {
        if (typeof raw.end === 'string' && TIME_RE.test(raw.end)) end = `${date}T${raw.end}`;
        else if (typeof raw.end === 'string' && isValidLocal(raw.end)) end = raw.end;
        else errors.push(`${label}: „end” musi mieć postać GG:MM albo RRRR-MM-DDTGG:MM (koniec innego dnia).`);
      }
      if (end && isValidLocal(start) && TIME_RE.test(time)) {
        const s = toInstant(start, tz ?? dayZone);
        const e = toInstant(end, endTz ?? tz ?? dayZone);
        if (!(e > s)) errors.push(`${label}: koniec musi być po początku (koniec następnego dnia zapisz jako RRRR-MM-DDTGG:MM).`);
      }

      let audience: Audience = 'all';
      const forValue = raw.for ?? 'all';
      if (forValue !== 'all') {
        if (!Array.isArray(forValue) || forValue.length === 0 || !forValue.every((n) => typeof n === 'string')) {
          errors.push(`${label}: „for” to "all" albo lista imion, np. ["Ania", "Bartek"].`);
        } else {
          const uids: string[] = [];
          for (const name of forValue as string[]) {
            const found = byName.get(nameKey(name));
            if (!found) errors.push(`${label}: „${name}” nie jest zatwierdzonym uczestnikiem tego wyjazdu.`);
            else if (found.length > 1) errors.push(`${label}: imię „${name}” ma kilka osób – nadaj im różne imiona w panelu „Osoby”.`);
            else if (!uids.includes(found[0])) uids.push(found[0]);
          }
          audience = uids;
        }
      }

      let place: PlanPlace | undefined;
      if (raw.place !== undefined) {
        const p = raw.place;
        if (!isObject(p) || typeof p.name !== 'string' || !p.name.trim()) {
          errors.push(`${label}: „place” musi mieć co najmniej „name”.`);
        } else {
          place = { name: p.name.trim() };
          if (typeof p.address === 'string' && p.address.trim()) place.address = p.address.trim();
          const hasLat = p.lat !== undefined;
          const hasLng = p.lng !== undefined;
          if (hasLat || hasLng) {
            const ok = typeof p.lat === 'number' && typeof p.lng === 'number' && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
            if (!ok) errors.push(`${label}: „lat” i „lng” muszą być liczbami (szerokość −90…90, długość −180…180).`);
            else {
              place.lat = p.lat as number;
              place.lng = p.lng as number;
            }
          }
        }
      }

      if (raw.notes !== undefined && typeof raw.notes !== 'string') errors.push(`${label}: „notes” musi być tekstem.`);
      if (raw.fixed !== undefined && typeof raw.fixed !== 'boolean') errors.push(`${label}: „fixed” to true albo false.`);

      const item: PlanItem = {
        id: makeId(date, ii),
        type,
        title,
        start,
        audience,
        pinnedToDate: raw.fixed === true || type === 'flight' || type === 'checkin',
      };
      if (end) item.end = end;
      if (tz) item.tz = tz;
      if (endTz) item.endTz = endTz;
      if (place) item.place = place;
      if (typeof raw.notes === 'string' && raw.notes.trim()) item.notes = raw.notes.trim();
      items.push(item);
    });

    const day: DayDoc = {
      date,
      baseLocation: typeof rawDay.base === 'string' ? rawDay.base.trim() : '',
      items,
      revision: Number.isInteger(revision) ? (revision as number) : 1,
    };
    if (dayZone !== ctx.tripTimezone) day.timezone = dayZone;
    if (rawDay.weather !== undefined && WEATHER.includes(rawDay.weather as WeatherDependency)) day.weatherDependent = rawDay.weather as WeatherDependency;
    days.push(day);
  });

  if (errors.length) return { ok: false, errors };
  days.sort((a, b) => a.date.localeCompare(b.date));
  return { ok: true, days, revision: revision as number, warnings };
}
