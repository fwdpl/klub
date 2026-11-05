// Wspólne wydatki (v2, decyzje Jacka z 5.11.2026): rozliczenie w walucie, w której płacono;
// osobno przeliczenie całości na PLN po bieżącym kursie średnim NBP. Logika bez DOM i bazy – testowana osobno.
// Kwoty liczone w groszach / jednostkach podstawowych (liczby całkowite), żeby nie gubić groszy na ułamkach.

export type ExpenseKind = 'expense' | 'transfer';
export type SplitMode = 'equal' | 'amounts';
export type Category = 'food' | 'transport' | 'lodging' | 'tickets' | 'shopping' | 'other';

export interface Expense {
  id: string;
  kind: ExpenseKind; // transfer = zwrot pieniędzy (paidBy oddaje osobie z shares)
  title: string;
  amount: number;
  currency: string; // ISO 4217, np. 'JPY'
  date: string; // 'YYYY-MM-DD' (dzień w czasie miejsca)
  category?: Category;
  paidBy: string;
  split: SplitMode;
  shares: Record<string, number>; // ile przypada na osobę (suma = amount)
  names: Record<string, string>; // imiona z chwili wpisu – zostają, gdy ktoś zrezygnuje
  note?: string;
  viaPln?: boolean; // zwrot z rozliczenia „Całość w PLN” – od niego rozliczenie idzie już tylko w złotych
  createdBy: string;
}

export const CATEGORY_LABEL: Record<Category, string> = {
  food: '🍜 Jedzenie',
  transport: '🚕 Transport',
  lodging: '🛏️ Nocleg',
  tickets: '🎟️ Bilety',
  shopping: '🛍️ Zakupy',
  other: '📦 Inne',
};

// ---------- waluty ----------

const decimalsCache = new Map<string, number>();

/** Liczba miejsc po przecinku waluty (JPY 0, EUR 2) – z Intl, domyślnie 2. */
export function decimals(currency: string): number {
  let d = decimalsCache.get(currency);
  if (d === undefined) {
    try {
      d =
        new Intl.NumberFormat('en', {
          style: 'currency',
          currency,
        }).resolvedOptions().maximumFractionDigits ?? 2;
    } catch {
      d = 2;
    }
    decimalsCache.set(currency, d);
  }
  return d;
}

export const toMinor = (amount: number, currency: string): number => Math.round(amount * 10 ** decimals(currency));
export const fromMinor = (minor: number, currency: string): number => minor / 10 ** decimals(currency);

/** „12 300 JPY”, „45,50 EUR”, „412,30 zł” – zawsze z kodem waluty (PLN jako zł). */
export function formatMoney(amount: number, currency: string): string {
  const d = decimals(currency);
  const text = amount.toLocaleString('pl-PL', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
  return `${text} ${currency === 'PLN' ? 'zł' : currency}`;
}

/** Jedna liczba wpisana przez człowieka: „12 300”, „45,5”, „1.234,50” → liczba (może być 0) albo null. */
function parseNumber(text: string): number | null {
  let t = text;
  if (!t) return null;
  if (t.includes(',') && t.includes('.')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else t = t.replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const clean = (text: string) => text.replace(/[\s\u00a0]/g, '').replace(/[−–]/g, '-');

/** Czy wpis to działanie (np. „35+2,50+5,50” albo „100-11,50”), a nie jedna liczba. */
export function isSum(text: string): boolean {
  return /\d[+-]/.test(clean(text));
}

/**
 * Kwota: jedna liczba albo działanie z + i − (decyzja Jacka z 5.11.2026 – zakupy bez liczenia poza aplikacją).
 * „35+2,50+5,50+7” → 50, „100-11,50-5” → 83,5. Znak na końcu (w trakcie pisania) jest pomijany.
 * Wynik musi być dodatni, inaczej null.
 */
export function parseAmount(text: string): number | null {
  const t = clean(text).replace(/[+-]+$/, '');
  if (!t) return null;
  if (!isSum(t)) {
    const n = parseNumber(t);
    return n !== null && n > 0 ? n : null;
  }
  const terms = t.match(/[+-]?[^+-]+/g) ?? [];
  if (terms.join('') !== t) return null;
  let cents = 0;
  for (const term of terms) {
    const sign = term.startsWith('-') ? -1 : 1;
    const n = parseNumber(term.replace(/^[+-]/, ''));
    if (n === null) return null;
    cents += sign * Math.round(n * 100);
  }
  return cents > 0 ? cents / 100 : null;
}

// ---------- podział ----------

/** Po równo; reszta z dzielenia (grosze/jeny) przypada kolejno pierwszym osobom. */
export function splitEqual(amount: number, currency: string, uids: string[]): Record<string, number> {
  const total = toMinor(amount, currency);
  const ids = [...uids].sort();
  const base = Math.floor(total / ids.length);
  let rest = total - base * ids.length;
  return Object.fromEntries(
    ids.map((uid) => {
      const extra = rest > 0 ? 1 : 0;
      rest -= extra;
      return [uid, fromMinor(base + extra, currency)];
    }),
  );
}

/** Ile zostało do rozdzielenia przy podziale kwotami (w jednostkach waluty; ujemne = za dużo). */
export function unallocated(amount: number, currency: string, shares: Record<string, number>): number {
  const sum = Object.values(shares).reduce((n, v) => n + toMinor(v, currency), 0);
  return fromMinor(toMinor(amount, currency) - sum, currency);
}

// ---------- salda i przelewy ----------

/** Saldo: + do odebrania, − do oddania. Klucz: waluta → osoba → jednostki podstawowe (grosze). */
export type Balances = Map<string, Map<string, number>>;

export function balances(list: Pick<Expense, 'amount' | 'currency' | 'paidBy' | 'shares'>[]): Balances {
  const out: Balances = new Map();
  for (const e of list) {
    const cur = out.get(e.currency) ?? new Map<string, number>();
    out.set(e.currency, cur);
    cur.set(e.paidBy, (cur.get(e.paidBy) ?? 0) + toMinor(e.amount, e.currency));
    for (const [uid, share] of Object.entries(e.shares)) cur.set(uid, (cur.get(uid) ?? 0) - toMinor(share, e.currency));
  }
  return out;
}

export interface Transfer {
  from: string;
  to: string;
  minor: number;
}

/** Jak najmniej przelewów: największy dłużnik oddaje największemu wierzycielowi (najwyżej n−1 przelewów). */
export function settle(balance: Map<string, number>, ignoreBelow = 1): Transfer[] {
  const debtors = [...balance].filter(([, v]) => v < 0).map(([uid, v]) => ({ uid, left: -v }));
  const creditors = [...balance].filter(([, v]) => v > 0).map(([uid, v]) => ({ uid, left: v }));
  const byLeft = (a: { uid: string; left: number }, b: { uid: string; left: number }) => b.left - a.left || a.uid.localeCompare(b.uid);
  const out: Transfer[] = [];
  for (;;) {
    debtors.sort(byLeft);
    creditors.sort(byLeft);
    const d = debtors[0];
    const c = creditors[0];
    if (!d || !c || d.left < ignoreBelow || c.left < ignoreBelow) break;
    const minor = Math.min(d.left, c.left);
    out.push({ from: d.uid, to: c.uid, minor });
    d.left -= minor;
    c.left -= minor;
  }
  return out;
}

// ---------- przeliczenie na PLN (kurs średni NBP) ----------

export interface Rates {
  date: string; // data tabeli NBP, np. '2026-11-05'
  mid: Record<string, number>; // PLN za 1 jednostkę waluty
}

/** Tabela NBP (A albo B) → kursy; tabela B uzupełnia rzadsze waluty (np. MAD). */
export function parseNbp(tables: { effectiveDate: string; rates: { code: string; mid: number }[] }[]): Rates {
  const mid: Record<string, number> = { PLN: 1 };
  let date = '';
  for (const t of tables) {
    if (t.effectiveDate > date) date = t.effectiveDate;
    for (const r of t.rates) if (!(r.code in mid) && r.mid > 0) mid[r.code] = r.mid;
  }
  return { date, mid };
}

/** Salda wszystkich walut w groszach PLN; zaokrąglenia wyrównane tak, żeby suma była zerem. */
export function balancesInPln(all: Balances, rates: Rates): { balance: Map<string, number>; missing: string[] } {
  const out = new Map<string, number>();
  const missing: string[] = [];
  for (const [currency, byUid] of all) {
    const rate = rates.mid[currency];
    if (rate === undefined) {
      missing.push(currency);
      continue;
    }
    for (const [uid, minor] of byUid) out.set(uid, (out.get(uid) ?? 0) + Math.round(fromMinor(minor, currency) * rate * 100));
  }
  const drift = [...out.values()].reduce((n, v) => n + v, 0);
  if (drift !== 0 && out.size) {
    const [uid] = [...out].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
    out.set(uid, out.get(uid)! - drift);
  }
  return { balance: out, missing };
}

/** Przy kursie bieżącym drobne różnice po wcześniejszych zwrotach w PLN pomijamy (poniżej 1 zł). */
export const PLN_IGNORE_BELOW = 100;

export async function fetchNbpRates(fetcher: typeof fetch = fetch): Promise<Rates> {
  const get = async (table: 'A' | 'B') => {
    const res = await fetcher(`https://api.nbp.pl/api/exchangerates/tables/${table}/?format=json`, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`nbp ${table} ${res.status}`);
    return (
      (await res.json()) as {
        effectiveDate: string;
        rates: { code: string; mid: number }[];
      }[]
    )[0];
  };
  const [a, b] = await Promise.all([get('A'), get('B').catch(() => null)]);
  return parseNbp(b ? [a, b] : [a]);
}

// ---------- tekst rozliczenia (do skopiowania i wysłania poza aplikacją) ----------

export interface SettlementText {
  tripTitle: string;
  expenses: Expense[];
  name: (uid: string) => string;
  pln?: { rates: Rates; transfers: Transfer[]; missing: string[] };
  today: string; // 'D.MM.RRRR'
}

/** Po pierwszym zwrocie z rozliczenia w PLN liczy się już tylko rozliczenie w złotych. */
export const settlesInPln = (list: Pick<Expense, 'viaPln'>[]): boolean => list.some((e) => e.viaPln);

/** Do rozliczenia w walutach – bez zwrotów zrobionych w PLN. */
export const perCurrency = <T extends Pick<Expense, 'viaPln'>>(list: T[]): T[] => list.filter((e) => !e.viaPln);

const shortIso = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${Number(d)}.${m}.${y}`;
};

export function settlementText(s: SettlementText): string {
  const real = s.expenses.filter((e) => e.kind === 'expense');
  const totals = new Map<string, number>();
  for (const e of real) totals.set(e.currency, (totals.get(e.currency) ?? 0) + toMinor(e.amount, e.currency));
  const lines = [`Rozliczenie: ${s.tripTitle} (stan na ${s.today})`];
  lines.push(`Wydatki: ${real.length}${totals.size ? ` · razem ${[...totals].map(([c, m]) => formatMoney(fromMinor(m, c), c)).join(', ')}` : ''}`);
  const all = balances(s.expenses);
  const local = settlesInPln(s.expenses) ? new Map() : balances(perCurrency(s.expenses));
  for (const [currency, byUid] of [...local].sort(([a], [b]) => a.localeCompare(b))) {
    const transfers = settle(byUid);
    lines.push('', `W ${currency === 'PLN' ? 'złotych' : currency}:`);
    if (!transfers.length) lines.push('  rozliczone ✓');
    for (const t of transfers) lines.push(`  ${s.name(t.from)} → ${s.name(t.to)}: ${formatMoney(fromMinor(t.minor, currency), currency)}`);
  }
  if (s.pln) {
    const used = [...all.keys()].filter((c) => c !== 'PLN' && s.pln!.rates.mid[c] !== undefined);
    lines.push(
      '',
      `Całość w PLN (kurs średni NBP z ${shortIso(s.pln.rates.date)}${used.length ? `: ${used.map((c) => `${c} ${s.pln!.rates.mid[c].toLocaleString('pl-PL', { maximumFractionDigits: 6 })}`).join(', ')}` : ''}):`,
    );
    if (!s.pln.transfers.length) lines.push('  rozliczone ✓');
    for (const t of s.pln.transfers) lines.push(`  ${s.name(t.from)} → ${s.name(t.to)}: ${formatMoney(fromMinor(t.minor, 'PLN'), 'PLN')}`);
    if (s.pln.missing.length) lines.push(`  (bez kursu NBP: ${s.pln.missing.join(', ')} – nieprzeliczone)`);
  }
  return lines.join('\n');
}
