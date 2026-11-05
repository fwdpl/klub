// Kierunki – logika bez bazy (sortowanie, termin ze słów); testy: destinations.test.ts.

import type { Destination } from './destinations';

/** Sortowanie: alfabetycznie albo wg terminu (bez terminu – na końcu, alfabetycznie). */
export function sortDestinations(list: Destination[], by: 'name' | 'date'): Destination[] {
  const byName = (a: Destination, b: Destination) => a.name.localeCompare(b.name, 'pl');
  if (by === 'name') return [...list].sort(byName);
  return [...list].sort((a, b) => (a.sortDate ?? '9999').localeCompare(b.sortDate ?? '9999') || byName(a, b));
}

export const MONTHS = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];

// początki nazw miesięcy (działa też „grudnia”, „gru”) i pory roku → numer miesiąca
const MONTH_STEMS: [RegExp, number][] = [
  [/\bsty/, 1],
  [/\blut/, 2],
  [/\bmar/, 3],
  [/\bkwi/, 4],
  [/\bmaj/, 5],
  [/\bcze/, 6],
  [/\blip/, 7],
  [/\bsie/, 8],
  [/\bwrz/, 9],
  [/\bpa[zź]/, 10],
  [/\blis/, 11],
  [/\bgru/, 12],
  [/\bwios/, 4],
  [/\blat|\blet/, 7],
  [/\bjesie|\bjesien/, 10],
  [/\bzim/, 1],
];

/** „grudzień 2027”, „jesień 2027”, „maj–czerwiec 2028” → '2027-12' itd.; bez roku albo miesiąca – null. */
export function guessSortDate(text: string): string | null {
  const t = text.toLocaleLowerCase('pl');
  const year = /\b(20\d{2})\b/.exec(t)?.[1];
  if (!year) return null;
  const month = MONTH_STEMS.find(([re]) => re.test(t))?.[1];
  return month ? `${year}-${String(month).padStart(2, '0')}` : `${year}-01`;
}
