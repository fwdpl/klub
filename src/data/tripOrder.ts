// Kolejność wyjazdów na liście: chronologicznie według „Orientacyjnych dat” (tekst, np. „luty 2028”).
// Pole zostaje tekstem – odczytujemy z niego miesiąc i rok; czego nie da się odczytać, trafia na koniec.

// Rdzenie polskich nazw miesięcy (mianownik i dopełniacz: „luty/lutego”, „sierpień/sierpnia”…)
const MONTHS: [RegExp, number][] = [
  [/\bstycz/, 0],
  [/\blut/, 1],
  [/\bmar(?:zec|ca)\b/, 2],
  [/\bkwie/, 3],
  [/\bmaj|\bmaja\b/, 4],
  [/\bczerw/, 5],
  [/\blip/, 6],
  [/\bsierp/, 7],
  [/\bwrze[sś]/, 8],
  [/\bpa[zź]dzier/, 9],
  [/\blistopad/, 10],
  [/\bgrud/, 11],
];

const SEASONS: [RegExp, number][] = [
  [/\bzim/, 0],
  [/\bwiosn/, 3],
  [/\blat(?:o|em)\b/, 6],
  [/\bjesie[nń]/, 9],
];

/** Miesiąc rozpoczęcia jako liczba (rok·12 + miesiąc 0–11) albo null, gdy tekstu nie da się odczytać. */
export function approxMonth(text: string): number | null {
  const t = text.toLowerCase();
  // 2027-03
  let m = /\b(20\d{2})-(\d{1,2})\b/.exec(t);
  if (m && +m[2] >= 1 && +m[2] <= 12) return +m[1] * 12 + (+m[2] - 1);
  // 03.2027, 12–20.03.2027, 3/2027
  m = /\b(\d{1,2})[./](20\d{2})\b/.exec(t);
  if (m && +m[1] >= 1 && +m[1] <= 12) return +m[2] * 12 + (+m[1] - 1);

  const year = /\b(20\d{2})\b/.exec(t);
  if (!year) return null;
  const before = t.slice(0, year.index + 4);
  // pierwszy miesiąc w tekście przed rokiem („luty–marzec 2027” → luty)
  let best: { at: number; month: number } | null = null;
  for (const [re, month] of [...MONTHS, ...SEASONS]) {
    const hit = re.exec(before);
    if (hit && (!best || hit.index < best.at)) best = { at: hit.index, month };
  }
  return +year[1] * 12 + (best?.month ?? 0);
}

const MONTH_NAMES = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];

/** „luty 2028” – do podpowiedzi w formularzu, jak aplikacja odczytała daty. */
export function monthLabel(value: number): string {
  return `${MONTH_NAMES[value % 12]} ${Math.floor(value / 12)}`;
}

interface Sortable {
  status: string;
  title: string;
  approxDates: string;
}

/** Archiwum na końcu; poza tym chronologicznie, nieodczytane daty na końcu swojej grupy, remis – po tytule. */
export function compareTrips(a: Sortable, b: Sortable): number {
  const archived = Number(a.status === 'archived') - Number(b.status === 'archived');
  if (archived) return archived;
  const am = approxMonth(a.approxDates ?? '');
  const bm = approxMonth(b.approxDates ?? '');
  if (am !== bm) {
    if (am === null) return 1;
    if (bm === null) return -1;
    return am - bm;
  }
  return a.title.localeCompare(b.title, 'pl');
}
