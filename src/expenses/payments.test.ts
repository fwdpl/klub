import { describe, expect, it } from 'vitest';
import { nextDue, shortDate, sumText, summary, type PaymentItem } from './payments';

const item = (id: string, amount: number, extra: Partial<PaymentItem> = {}): PaymentItem => ({ id, title: id, amount, currency: 'PLN', ...extra });

describe('wpłaty na wyjazd', () => {
  it('suma w walutach i najbliższy termin', () => {
    const items = [
      item('lot', 3200, { due: '2026-11-20', paidOn: '2026-11-10' }),
      item('hotel', 2500, { due: '2027-01-15' }),
      item('bilety', 150, { currency: 'EUR', due: '2026-12-01' }),
    ];
    expect(sumText(items)).toBe('5700,00 zł + 150,00 EUR');
    expect(nextDue(items, '2026-11-05')).toEqual({
      item: items[2],
      overdue: false,
    });
    expect(nextDue(items, '2026-12-02')?.overdue).toBe(true);
    expect(nextDue([item('x', 1)], '2026-11-05')).toBeNull();
    expect(shortDate('2027-01-15')).toBe('15.01.2027');
  });

  it('zestawienie organizatora według pozycji', () => {
    const rows = summary([
      {
        name: 'Ania',
        items: [item('Lot', 3200, { paidOn: '2026-11-10' }), item('Hotel', 2500)],
      },
      { name: 'Bartek', items: [item('Lot', 3200), item('Hotel', 2500)] },
    ]);
    expect(rows).toEqual([
      { title: 'Lot', paid: 1, total: 2, missing: '3200,00 zł' },
      { title: 'Hotel', paid: 0, total: 2, missing: '5000,00 zł' },
    ]);
  });
});
