import crypto from 'node:crypto';

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;
const KEY_LEN = 64;

export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .scryptSync(String(plain), salt, KEY_LEN, SCRYPT_PARAMS)
    .toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(plain: string, stored: string | null | undefined): boolean {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hashHex] = parts;
  let candidate: Buffer;
  try {
    candidate = crypto.scryptSync(String(plain), salt, KEY_LEN, SCRYPT_PARAMS);
  } catch {
    return false;
  }
  const expected = Buffer.from(hashHex, 'hex');
  if (candidate.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}
