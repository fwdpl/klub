import { describe, expect, it } from 'vitest';
import { moveItem } from './list';

describe('przesuwanie punktu na liście', () => {
  it('w dół, w górę, na koniec i na początek – bez zmiany oryginału', () => {
    const list = ['a', 'b', 'c', 'd'];
    expect(moveItem(list, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(list, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
    expect(moveItem(list, 1, 3)).toEqual(['a', 'c', 'd', 'b']);
    expect(moveItem(list, 2, 0)).toEqual(['c', 'a', 'b', 'd']);
    expect(list).toEqual(['a', 'b', 'c', 'd']);
  });
});
