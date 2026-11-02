import { describe, expect, it } from 'vitest';
import { plural } from './text';

describe('odmiana po liczbie', () => {
  it('1, 2–4, 5+, nastki i 22', () => {
    const p = (n: number) => plural(n, 'punkt', 'punkty', 'punktów');
    expect([1, 2, 4, 5, 12, 14, 21, 22, 25, 0].map(p)).toEqual([
      '1 punkt',
      '2 punkty',
      '4 punkty',
      '5 punktów',
      '12 punktów',
      '14 punktów',
      '21 punktów',
      '22 punkty',
      '25 punktów',
      '0 punktów',
    ]);
  });
});
