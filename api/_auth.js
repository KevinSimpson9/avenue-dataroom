// Shared session verification logic
import crypto from 'crypto';

export function verifySession(req) {
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.match(/avenue_session=([^;]+)/);
  if (!match) return false;

  const [expiresStr, signature] = match[1].split('.');
  if (!expiresStr || !signature) return false;

  const expires = parseInt(expiresStr, 10);
  if (isNaN(expires) || Date.now() > expires) return false;

  const sessionSecret = process.env.SESSION_SECRET || 'change-me';
  const expectedSig = crypto
    .createHmac('sha256', sessionSecret)
    .update(expiresStr)
    .digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
  } catch {
    return false;
  }
}
