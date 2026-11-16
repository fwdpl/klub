import { createHmac, randomBytes } from 'node:crypto';

// Kody z Google Authenticator (TOTP, RFC 6238: HMAC-SHA1, 6 cyfr, okno 30 s) – logowanie awaryjne
// organizatora bez konsoli Firebase (decyzja Jacka z 16.11.2026). Tajny klucz trzyma tylko serwer.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const STEP_SECONDS = 30;
const DIGITS = 6;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function newSecret(): string {
  return base32Encode(randomBytes(20));
}

/** Kod dla danego kroku czasu (liczba 30-sekundowych okresów od 1970). */
export function codeAt(secret: string, step: number, digits = DIGITS): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const bin = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

/**
 * Sprawdza kod (z tolerancją ±1 okres na różnicę zegarów). Zwraca krok, który pasował, albo null.
 * lastStep – ostatnio użyty krok: ten sam kod nie zadziała drugi raz.
 */
export function verifyTotp(secret: string, code: string, nowMs: number, lastStep = -1): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const now = Math.floor(nowMs / 1000 / STEP_SECONDS);
  for (const step of [now, now - 1, now + 1]) {
    if (step <= lastStep) continue;
    if (codeAt(secret, step) === code) return step;
  }
  return null;
}

/** Link do dodania konta w aplikacji uwierzytelniającej (Android otwiera go bezpośrednio). */
export function otpauthUrl(secret: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
