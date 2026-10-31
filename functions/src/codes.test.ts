import { describe, expect, it } from 'vitest';
import {
  CODE_LENGTH,
  LOCK_MS,
  MAX_FAILURES,
  afterFailure,
  codeMatches,
  formatCode,
  generateCode,
  hashCode,
  isLocked,
  normalizeCode,
  normalizeEmail,
  type AttemptState,
} from './codes';

const NOW = 1_800_000_000_000;

describe('normalizacja', () => {
  it('mail: małe litery, bez spacji, odrzuca błędne', () => {
    expect(normalizeEmail('  Organizator@Example.COM ')).toBe('organizator@example.com');
    expect(normalizeEmail('bez-malpy')).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
  });

  it('kod: wielkie litery, bez myślników i spacji', () => {
    expect(normalizeCode('abcd-efgh')).toBe('ABCDEFGH');
    expect(normalizeCode(' ab cd ')).toBe('ABCD');
    expect(normalizeCode('ab')).toBeNull();
  });
});

describe('generowanie kodu', () => {
  it('ma stałą długość i nie zawiera mylących znaków', () => {
    for (let i = 0; i < 200; i++) {
      const c = generateCode();
      expect(c).toHaveLength(CODE_LENGTH);
      expect(c).not.toMatch(/[01ILO]/);
    }
  });

  it('formatuje jako XXXX-XXXX i wraca do tej samej postaci po normalizacji', () => {
    const c = generateCode();
    expect(formatCode(c)).toMatch(/^.{4}-.{4}$/);
    expect(normalizeCode(formatCode(c))).toBe(c);
  });
});

describe('dopasowanie kodu', () => {
  const salt = 'sol';
  const hashed = { email: 'a@b.pl', salt, codeHash: hashCode('ABCDEFGH', salt), expiresAtMs: NOW + 1000 };

  it('przyjmuje poprawny kod wygenerowany', () => {
    expect(codeMatches(hashed, 'ABCDEFGH', NOW)).toBe(true);
  });

  it('odrzuca zły, wygasły i użyty kod', () => {
    expect(codeMatches(hashed, 'ABCDEFGX', NOW)).toBe(false);
    expect(codeMatches(hashed, 'ABCDEFGH', NOW + 1000)).toBe(false);
    expect(codeMatches({ ...hashed, usedAtMs: NOW - 1 }, 'ABCDEFGH', NOW)).toBe(false);
  });

  it('przyjmuje kod wpisany ręcznie w konsoli w dowolnej formie', () => {
    expect(codeMatches({ email: 'a@b.pl', code: 'start-2026' }, 'START2026', NOW)).toBe(true);
    expect(codeMatches({ email: 'a@b.pl', code: 'start-2026' }, 'START2027', NOW)).toBe(false);
  });

  it('odrzuca wpis bez kodu', () => {
    expect(codeMatches({ email: 'a@b.pl' }, 'ABCD', NOW)).toBe(false);
  });
});

describe('limit prób', () => {
  it('blokuje po MAX_FAILURES nieudanych próbach i odblokowuje po czasie', () => {
    let state: AttemptState | undefined;
    for (let i = 0; i < MAX_FAILURES; i++) {
      expect(isLocked(state, NOW)).toBe(false);
      state = afterFailure(state, NOW);
    }
    expect(isLocked(state, NOW)).toBe(true);
    expect(isLocked(state, NOW + LOCK_MS)).toBe(false);
    // po wygaśnięciu blokady liczymy od nowa
    expect(afterFailure(state, NOW + LOCK_MS)).toEqual({ failures: 1 });
  });
});
