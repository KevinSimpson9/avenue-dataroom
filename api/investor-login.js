// POST /api/investor-login
// Body: { email, password }
// - If email isn't in the registry, return neutral "if registered..." response.
// - If passwordHash is null (haven't set up yet), email a fresh setup link and
//   return { ok: true, needsSetup: true }.
// - If password verifies, set the portal session cookie + return redirect.
// - Otherwise slow-reject with generic error.
import { loadRegistry, findByEmail, normalizeEmail, saveRegistry } from './_portal-registry.js';
import { verifyPassword, issueToken, setSessionCookie } from './_portal-auth.js';
import { sendSetupLink } from './_portal-email.js';
import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');
  if (!email || !password) {
    await delay(400);
    return res.status(200).json({ ok: false, message: 'Please enter your email and password.' });
  }

  let registry, fileId, drive;
  try {
    ({ registry, fileId, drive } = await loadRegistry());
  } catch (err) {
    console.error('investor-login: load registry failed', err);
    return res.status(500).json({ ok: false, message: 'Server not configured. Contact Kevin@AKCapital.fund.' });
  }

  const entry = findByEmail(registry, email);
  if (!entry) {
    // Slow-reject + neutral message so attackers can't probe which emails exist.
    await delay(600);
    return res.status(401).json({ ok: false, message: 'Email or password is incorrect.' });
  }

  // No password set yet → trigger setup link, return needsSetup
  if (!entry.passwordHash) {
    const token = issueToken({ email: entry.email, purpose: 'setup' });
    sendSetupLink({ to: entry.email, name: entry.name, token }).catch(err =>
      console.warn('investor-login: setup email failed', err)
    );
    return res.status(200).json({
      ok: true,
      needsSetup: true,
      message: 'Check your inbox — we just emailed you a link to set your password.'
    });
  }

  // Verify password
  if (!verifyPassword(password, entry.passwordHash)) {
    await delay(600);
    return res.status(401).json({ ok: false, message: 'Email or password is incorrect.' });
  }

  // Issue session
  setSessionCookie(res, { email: entry.email, role: entry.role });

  // Rotate reset nonce now that they've successfully signed in with a password
  // (only matters if we re-use it for reset links later — keeps tokens fresh)
  if (!entry.resetNonce) {
    entry.resetNonce = crypto.randomBytes(8).toString('hex');
    try { await saveRegistry(drive, fileId, registry); } catch { /* non-fatal */ }
  }

  const redirect = entry.role === 'admin' ? '/portal/admin' : '/portal';
  return res.status(200).json({ ok: true, redirect });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
