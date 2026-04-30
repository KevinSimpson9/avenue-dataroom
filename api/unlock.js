// /api/unlock - Verifies password and sets signed session cookie
import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  const submitted = (req.body?.password || '').trim();
  const correct = process.env.DATA_ROOM_PASSWORD || '';

  if (!correct) {
    return res.status(500).json({ ok: false, message: 'Server not configured. Contact administrator.' });
  }

  // Constant-time comparison
  if (!constantTimeEqual(submitted, correct)) {
    await new Promise(r => setTimeout(r, 800)); // Slow down brute-force
    return res.status(401).json({ ok: false, message: 'Incorrect password.' });
  }

  // Generate signed session token (7-day expiration)
  const sessionSecret = process.env.SESSION_SECRET || 'change-me';
  const expires = Date.now() + (1000 * 60 * 60 * 24 * 7);
  const signature = crypto
    .createHmac('sha256', sessionSecret)
    .update(String(expires))
    .digest('base64');
  const cookieValue = `${expires}.${signature}`;

  res.setHeader('Set-Cookie', `avenue_session=${cookieValue}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`);
  return res.status(200).json({ ok: true });
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
