import { formatMoney, fromMinor, toMinor } from './expenses';

// Wpłaty na wyjazd (v2, decyzja Jacka z 5.11.2026): osobno od wspólnych wydatków. Organizator wpisuje każdej osobie,
// ile ma wpłacić (np. lot, hotel, termin), i odhacza wpłaty. Osoba widzi tylko swoje. Dokument trips/{id}/payments/{uid}.

export interface PaymentItem {
  id: string;
  title: string;
  amount: number;
  currency: string;
  due?: string; // 'YYYY-MM-DD'
  paidOn?: string; // 'YYYY-MM-DD' – odhaczone przez organizatora
}

export interface PaymentsDoc {
  name: string;
  items: PaymentItem[];
}

/** „3200 zł + 150 EUR” – suma kwot w każdej walucie. */
export function sumText(items: Pick<PaymentItem, 'amount' | 'currency'>[]): string {
  const sums = new Map<string, number>();
  for (const i of items) sums.set(i.currency, (sums.get(i.currency) ?? 0) + toMinor(i.amount, i.currency));
  return [...sums].map(([c, m]) => formatMoney(fromMinor(m, c), c)).join(' + ');
}

export const unpaid = (items: PaymentItem[]) => items.filter((i) => !i.paidOn);

/** Najbliższy termin niezapłaconej raty i czy minął. */
export function nextDue(items: PaymentItem[], today: string): { item: PaymentItem; overdue: boolean } | null {
  const open = unpaid(items)
    .filter((i) => i.due)
    .sort((a, b) => a.due!.localeCompare(b.due!));
  return open[0] ? { item: open[0], overdue: open[0].due! < today } : null;
}

/** Organizator: dla każdej pozycji (po nazwie) – ile osób zapłaciło i ile jeszcze brakuje. */
export function summary(docs: PaymentsDoc[]): { title: string; paid: number; total: number; missing: string }[] {
  const byTitle = new Map<string, { paid: number; total: number; open: PaymentItem[] }>();
  for (const d of docs) {
    for (const i of d.items) {
      const row = byTitle.get(i.title) ?? { paid: 0, total: 0, open: [] };
      byTitle.set(i.title, row);
      row.total += 1;
      if (i.paidOn) row.paid += 1;
      else row.open.push(i);
    }
  }
  return [...byTitle].map(([title, r]) => ({
    title,
    paid: r.paid,
    total: r.total,
    missing: sumText(r.open),
  }));
}

/** 'YYYY-MM-DD' → '15.01.2027' */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${Number(d)}.${m}.${y}`;
}
