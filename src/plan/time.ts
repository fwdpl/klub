// Czas w planie: lokalny czas miejsca ('YYYY-MM-DDTHH:mm') + strefa IANA (SPEC §4).
// Przeliczenie na chwilę w czasie (ms od epoki) służy wyłącznie do porównań (kolejność, kolizje) –
// nigdy nie jest zapisywane ani pokazywane.

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function isValidZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Czy zapis to istniejąca data i godzina (np. bez 31 lutego i 25:00). */
export function isValidLocal(local: string): boolean {
  const m = LOCAL_RE.exec(local);
  if (!m) return false;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d, h, mi));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d && h < 24 && mi < 60;
}

export function isValidDate(date: string): boolean {
  return isValidLocal(`${date}T00:00`);
}

/** Przesunięcie strefy względem UTC (minuty) w danej chwili. */
function offsetMinutes(zone: string, utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return Math.round((asUtc - Math.floor(utcMs / 60000) * 60000) / 60000);
}

/** Chwila w czasie dla czasu lokalnego w strefie (zmiany czasu letniego uwzględnione). */
export function toInstant(local: string, zone: string): number {
  const m = LOCAL_RE.exec(local);
  if (!m) return NaN;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const first = offsetMinutes(zone, guess);
  let instant = guess - first * 60000;
  const second = offsetMinutes(zone, instant);
  if (second !== first) instant = guess - second * 60000;
  return instant;
}

/** Dzisiejsza data ('YYYY-MM-DD') w strefie miejsca – do wyróżnienia „dziś” w planie. */
export function todayIn(zone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
