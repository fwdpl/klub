import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

// Bez znaków łatwych do pomylenia (0/O, 1/I/L)
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 8;
// Kody wpisywane ręcznie w konsoli też muszą mieć co najmniej tyle znaków (krótkie łatwo odgadnąć)
export const MIN_CODE_LENGTH = 6;
export const CODE_TTL_MS = 48 * 60 * 60 * 1000;
export const MAX_FAILURES = 5;
export const LOCK_MS = 15 * 60 * 1000;

export function normalizeEmail(email: unknown): string | null {
  if (typeof email !== 'string') return null;
  const e = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254 ? e : null;
}

/** Wielkie litery, bez spacji i myślników – kod można wpisać w dowolnej formie. */
export function normalizeCode(code: unknown): string | null {
  if (typeof code !== 'string') return null;
  const c = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length >= MIN_CODE_LENGTH && c.length <= 64 ? c : null;
}

export function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

/** Postać do pokazania: ABCD-EFGH */
export function formatCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function newSalt(): string {
  return randomBytes(16).toString('hex');
}

export function hashCode(code: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${code}`).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function emailKey(email: string): string {
  return createHash('sha256').update(email).digest('hex');
}

/** Wpis z kolekcji loginCodes: wygenerowany w panelu (hash) albo wpisany ręcznie w konsoli (code). */
export interface LoginCodeDoc {
  email: string;
  codeHash?: string;
  salt?: string;
  code?: string;
  expiresAtMs?: number;
  usedAtMs?: number;
}

export function codeMatches(entry: LoginCodeDoc, code: string, nowMs: number): boolean {
  if (entry.usedAtMs !== undefined) return false;
  if (entry.expiresAtMs !== undefined && entry.expiresAtMs <= nowMs) return false;
  if (entry.codeHash && entry.salt) return safeEqual(hashCode(code, entry.salt), entry.codeHash);
  if (entry.code) {
    const manual = normalizeCode(entry.code);
    return manual !== null && safeEqual(manual, code);
  }
  return false;
}

export interface AttemptState {
  failures: number;
  lockedUntilMs?: number;
}

export function isLocked(state: AttemptState | undefined, nowMs: number): boolean {
  return state?.lockedUntilMs !== undefined && state.lockedUntilMs > nowMs;
}

export function afterFailure(state: AttemptState | undefined, nowMs: number): AttemptState {
  // po wygaśnięciu blokady liczymy od nowa
  const prev = state && state.lockedUntilMs === undefined ? state.failures : 0;
  const failures = prev + 1;
  return failures >= MAX_FAILURES ? { failures: 0, lockedUntilMs: nowMs + LOCK_MS } : { failures };
}
