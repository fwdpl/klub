import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, codeAt, newSecret, otpauthUrl, verifyTotp } from './totp';

// Wektor testowy z RFC 6238 (SHA1, klucz „12345678901234567890”)
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('Google Authenticator (TOTP)', () => {
  it('zgodny z RFC 6238', () => {
    expect(codeAt(RFC_SECRET, Math.floor(59 / 30), 8)).toBe('94287082');
    expect(codeAt(RFC_SECRET, Math.floor(1111111109 / 30), 8)).toBe('07081804');
    expect(codeAt(RFC_SECRET, Math.floor(59 / 30))).toBe('287082');
  });

  it('base32 w obie strony, nowy klucz 32 znaki', () => {
    const buf = Buffer.from('Klub zaćmienie');
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
    expect(newSecret()).toMatch(/^[A-Z2-7]{32}$/);
  });

  it('sprawdzanie: okno ±30 s, bez ponownego użycia, tylko 6 cyfr', () => {
    const s = newSecret();
    const now = 1_800_000_000_000;
    const step = Math.floor(now / 30000);
    expect(verifyTotp(s, codeAt(s, step), now)).toBe(step);
    expect(verifyTotp(s, codeAt(s, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(s, codeAt(s, step - 2), now)).toBeNull();
    expect(verifyTotp(s, codeAt(s, step), now, step)).toBeNull();
    expect(verifyTotp(s, '12345', now)).toBeNull();
  });

  it('link otpauth dla aplikacji', () => {
    expect(otpauthUrl('ABC', 'jacek@example.com', 'Klub')).toBe('otpauth://totp/Klub%3Ajacek%40example.com?secret=ABC&issuer=Klub&algorithm=SHA1&digits=6&period=30');
  });
});
