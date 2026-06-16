// POST /api/jarvis-unlock - password gate for the Command Center.
// Uses its own JARVIS_PASSWORD env + jarvis_session cookie so it stays
// fully separate from the investor data-room gate.
import crypto from 'crypto';
import { signSession, SESSION_COOKIE_NAME } from './_jarvis.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  const submitted = (req.body?.password || '').trim();
  // Fall back to the data-room password if a dedicated one isn't set.
  const correct = process.env.JARVIS_PASSWORD || process.env.DATA_ROOM_PASSWORD || '';

  if (!correct) {
    return res.status(500).json({ ok: false, message: 'Command Center password not configured. Set JARVIS_PASSWORD in Vercel.' });
  }

  if (submitted.length !== correct.length ||
      !crypto.timingSafeEqual(Buffer.from(submitted), Buffer.from(correct))) {
    await new Promise(r => setTimeout(r, 800));
    return res.status(401).json({ ok: false, message: 'Incorrect password.' });
  }

  const expires = Date.now() + (1000 * 60 * 60 * 24 * 7);
  const cookieValue = `${expires}.${signSession(expires)}`;
  res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=${cookieValue}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`);
  return res.status(200).json({ ok: true });
}
