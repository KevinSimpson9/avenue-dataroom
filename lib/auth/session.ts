import crypto from 'node:crypto';
import { cookies } from 'next/headers';

/**
 * HMAC-signed session cookie. Format kept BYTE-IDENTICAL to the legacy
 * implementation in api/_portal-auth.js so existing logged-in users survive
 * the cutover from the old dispatcher to the new Next.js app.
 *
 * Cookie value: `<b64url(email)>.<role>.<expiresMs>.<sig>`
 */

export const SESSION_COOKIE = 'avenue_portal_session';
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 days

export type Role = 'admin' | 'investor';

export interface Session {
  email: string;
  role: Role;
  expires: number;
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET not configured');
  return s;
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64urlDecode(s: string): Buffer {
  let padded = s.replace(/-/g, '+').replace(/_/g, '/');
  while (padded.length % 4) padded += '=';
  return Buffer.from(padded, 'base64');
}

function signSession(emailB64: string, role: string, expires: number): string {
  return b64url(
    crypto
      .createHmac('sha256', secret())
      .update(`${emailB64}.${role}.${expires}`)
      .digest()
  );
}

export function buildSessionCookieValue(opts: { email: string; role: Role }): string {
  const emailB64 = b64url(opts.email.toLowerCase().trim());
  const expires = Date.now() + SESSION_MAX_AGE_SEC * 1000;
  const sig = signSession(emailB64, opts.role, expires);
  return `${emailB64}.${opts.role}.${expires}.${sig}`;
}

export function verifySessionValue(value: string | undefined | null): Session | null {
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const [emailB64, role, expiresStr, sig] = parts;
  if (role !== 'admin' && role !== 'investor') return null;
  const expires = parseInt(expiresStr, 10);
  if (!Number.isFinite(expires) || Date.now() > expires) return null;
  const expected = signSession(emailB64, role, expires);
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  let email: string;
  try {
    email = b64urlDecode(emailB64).toString('utf8');
  } catch {
    return null;
  }
  return { email, role, expires };
}

/** Read & verify the session from the current request's cookies (server-side). */
export async function getCurrentSession(): Promise<Session | null> {
  const store = await cookies();
  const c = store.get(SESSION_COOKIE);
  return verifySessionValue(c?.value);
}

export async function setSessionCookie(opts: { email: string; role: Role }): Promise<void> {
  const store = await cookies();
  store.set({
    name: SESSION_COOKIE,
    value: buildSessionCookieValue(opts),
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_MAX_AGE_SEC,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set({
    name: SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
}
