import crypto from 'node:crypto';

/**
 * HMAC-signed magic-link tokens, byte-compatible with the legacy implementation
 * in api/_portal-auth.js. Payload: `<b64url(email)>.<purpose>.<nonce>.<sig>`.
 * No time expiry; single-use is enforced at the call site (registry state).
 */

export type TokenPurpose = 'setup' | 'reset' | 'sign-envelope';

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

function signToken(emailB64: string, purpose: string, nonce: string): string {
  return b64url(
    crypto
      .createHmac('sha256', secret())
      .update(`${emailB64}.${purpose}.${nonce}`)
      .digest()
  );
}

export function issueToken(opts: {
  email: string;
  purpose: TokenPurpose;
  nonce?: string;
}): string {
  const emailB64 = b64url(opts.email.toLowerCase().trim());
  const nonce = opts.nonce || crypto.randomBytes(8).toString('hex');
  const sig = signToken(emailB64, opts.purpose, nonce);
  return `${emailB64}.${opts.purpose}.${nonce}.${sig}`;
}

export interface VerifiedToken {
  email: string;
  purpose: TokenPurpose;
  nonce: string;
}

export function verifyToken(token: string | undefined | null): VerifiedToken | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [emailB64, purpose, nonce, sig] = parts;
  const expected = signToken(emailB64, purpose, nonce);
  let ok = false;
  try {
    ok = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return null;
  }
  if (!ok) return null;
  let email: string;
  try {
    email = b64urlDecode(emailB64).toString('utf8');
  } catch {
    return null;
  }
  return { email, purpose: purpose as TokenPurpose, nonce };
}
