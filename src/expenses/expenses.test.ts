import { describe, expect, it } from 'vitest';
import {
  balances,
  balancesInPln,
  decimals,
  fetchNbpRates,
  formatMoney,
  parseAmount,
  parseNbp,
  perCurrency,
  settle,
  settlementText,
  settlesInPln,
  splitEqual,
  unallocated,
  type Expense,
} from './expenses';

const ex = (id: string, paidBy: string, amount: number, currency: string, shares: Record<string, number>, kind: Expense['kind'] = 'expense'): Expense => ({
  id,
  kind,
  title: id,
  amount,
  currency,
  date: '2026-12-11',
  paidBy,
  split: 'amounts',
  shares,
  names: {},
  createdBy: paidBy,
});
const names: Record<string, string> = {
  ania: 'Ania',
  bartek: 'Bartek',
  jacek: 'Jacek',
};

describe('wspólne wydatki', () => {
  it('waluty: miejsca po przecinku, format, wpisana kwota', () => {
    expect(decimals('JPY')).toBe(0);
    expect(decimals('EUR')).toBe(2);
    expect(formatMoney(12300, 'JPY')).toMatch(/^12\s300 JPY$/);
    expect(formatMoney(412.3, 'PLN')).toBe('412,30 zł');
    expect(parseAmount('12 300')).toBe(12300);
    expect(parseAmount('45,5')).toBe(45.5);
    expect(parseAmount('1.234,50')).toBe(1234.5);
    expect(parseAmount('1,234.50')).toBe(1234.5);
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('0')).toBeNull();
  });

  it('po równo: reszta dla pierwszych osób, suma się zgadza', () => {
    expect(splitEqual(100, 'EUR', ['jacek', 'ania', 'bartek'])).toEqual({
      ania: 33.34,
      bartek: 33.33,
      jacek: 33.33,
    });
    expect(splitEqual(1000, 'JPY', ['ania', 'bartek', 'jacek'])).toEqual({
      ania: 334,
      bartek: 333,
      jacek: 333,
    });
    expect(unallocated(100, 'EUR', { ania: 33.34, bartek: 33.33, jacek: 33.33 })).toBe(0);
    expect(unallocated(100, 'EUR', { ania: 50 })).toBe(50);
  });

  it('salda osobno w każdej walucie i jak najmniej przelewów', () => {
    const list = [
      ex('kolacja', 'jacek', 9000, 'JPY', {
        jacek: 3000,
        ania: 3000,
        bartek: 3000,
      }),
      ex('taksówka', 'ania', 3000, 'JPY', {
        jacek: 1000,
        ania: 1000,
        bartek: 1000,
      }),
      ex('muzeum', 'bartek', 30, 'EUR', { jacek: 10, ania: 10, bartek: 10 }),
    ];
    const b = balances(list);
    expect(Object.fromEntries(b.get('JPY')!)).toEqual({
      jacek: 5000,
      ania: -1000,
      bartek: -4000,
    });
    expect(settle(b.get('JPY')!)).toEqual([
      { from: 'bartek', to: 'jacek', minor: 4000 },
      { from: 'ania', to: 'jacek', minor: 1000 },
    ]);
    expect(settle(b.get('EUR')!)).toHaveLength(2);
    // zwrot zapisany jako przelew zeruje saldo
    const after = balances([...list, ex('zwrot', 'bartek', 4000, 'JPY', { jacek: 4000 }, 'transfer'), ex('zwrot', 'ania', 1000, 'JPY', { jacek: 1000 }, 'transfer')]);
    expect(settle(after.get('JPY')!)).toEqual([]);
  });

  it('przeliczenie na PLN: kursy NBP A+B, suma zero, brak kursu', () => {
    const rates = parseNbp([
      {
        effectiveDate: '2026-11-05',
        rates: [
          { code: 'JPY', mid: 0.0257 },
          { code: 'EUR', mid: 4.25 },
        ],
      },
      {
        effectiveDate: '2026-11-04',
        rates: [
          { code: 'MAD', mid: 0.41 },
          { code: 'EUR', mid: 9 },
        ],
      },
    ]);
    expect(rates).toEqual({
      date: '2026-11-05',
      mid: { PLN: 1, JPY: 0.0257, EUR: 4.25, MAD: 0.41 },
    });
    const b = balances([
      ex('kolacja', 'jacek', 9000, 'JPY', {
        jacek: 3000,
        ania: 3000,
        bartek: 3000,
      }),
      ex('muzeum', 'bartek', 30, 'EUR', { jacek: 10, ania: 10, bartek: 10 }),
      ex('herbata', 'ania', 10, 'XXX', { ania: 5, jacek: 5 }),
    ]);
    const { balance, missing } = balancesInPln(b, rates);
    expect(missing).toEqual(['XXX']);
    expect([...balance.values()].reduce((n, v) => n + v, 0)).toBe(0);
    expect(balance.get('jacek')).toBe(15420 - 4250); // 6000 JPY × 0,0257 − 10 EUR × 4,25
    expect(settle(balance, 100).length).toBeLessThanOrEqual(2);
  });

  it('kursy z API NBP (tabela B opcjonalna)', async () => {
    const fake = (async (url: string) => {
      if (url.includes('/B/')) return new Response('', { status: 404 });
      return new Response(JSON.stringify([{ effectiveDate: '2026-11-05', rates: [{ code: 'USD', mid: 3.9 }] }]));
    }) as unknown as typeof fetch;
    expect(await fetchNbpRates(fake)).toEqual({
      date: '2026-11-05',
      mid: { PLN: 1, USD: 3.9 },
    });
  });

  it('tekst rozliczenia do wysłania', () => {
    const list = [
      ex('kolacja', 'jacek', 9000, 'JPY', {
        jacek: 3000,
        ania: 3000,
        bartek: 3000,
      }),
    ];
    const text = settlementText({
      tripTitle: 'Japonia',
      expenses: list,
      name: (u) => names[u],
      today: '11.12.2026',
    });
    expect(text).toContain('Rozliczenie: Japonia (stan na 11.12.2026)');
    expect(text).toMatch(/Ania → Jacek: 3\s?000 JPY/);
    const pln = settlementText({
      tripTitle: 'Japonia',
      expenses: list,
      name: (u) => names[u],
      today: '11.12.2026',
      pln: {
        rates: { date: '2026-12-11', mid: { PLN: 1, JPY: 0.0257 } },
        transfers: [{ from: 'ania', to: 'jacek', minor: 7710 }],
        missing: [],
      },
    });
    expect(pln).toContain('Całość w PLN (kurs średni NBP z 11.12.2026: JPY 0,0257)');
    expect(pln).toContain('Ania → Jacek: 77,10 zł');
  });

  it('po zwrocie w PLN liczy się tylko rozliczenie w złotych', () => {
    const list = [
      ex('kolacja', 'jacek', 9000, 'JPY', {
        jacek: 3000,
        ania: 3000,
        bartek: 3000,
      }),
      {
        ...ex('zwrot', 'ania', 77.1, 'PLN', { jacek: 77.1 }, 'transfer'),
        viaPln: true,
      },
    ];
    expect(settlesInPln(list)).toBe(true);
    expect(perCurrency(list)).toHaveLength(1);
    const text = settlementText({
      tripTitle: 'Japonia',
      expenses: list,
      name: (u) => names[u],
      today: '11.12.2026',
      pln: {
        rates: { date: '2026-12-11', mid: { PLN: 1, JPY: 0.0257 } },
        transfers: [{ from: 'bartek', to: 'jacek', minor: 7710 }],
        missing: [],
      },
    });
    expect(text).not.toContain('W JPY');
    expect(text).toContain('Bartek → Jacek: 77,10 zł');
    const { balance } = balancesInPln(balances(list), {
      date: '2026-12-11',
      mid: { PLN: 1, JPY: 0.0257 },
    });
    expect(balance.get('ania')).toBe(0);
  });
});
