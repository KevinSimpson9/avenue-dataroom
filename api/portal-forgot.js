// POST /api/portal/forgot
// Body: { email }
// Triggers a fresh setup/reset magic-link email. Always returns the same neutral
// message regardless of whether the email is in the registry.
import { loadRegistry, findByEmail, normalizeEmail, updateEntry, saveRegistry } from './_portal-registry.js';
import { issueToken } from './_portal-auth.js';
import { sendSetupLink } from './_portal-email.js';
import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }
  const email = normalizeEmail(req.body?.email);
  const neutral = { ok: true, message: 'If that email is registered, a sign-in link is on its way.' };
  if (!email) return res.status(200).json(neutral);

  let registry, fileId, drive;
  try { ({ registry, fileId, drive } = await loadRegistry()); }
  catch (err) {
    console.error('portal-forgot: load registry failed', err);
    return res.status(200).json(neutral);
  }

  const entry = findByEmail(registry, email);
  if (!entry) {
    await delay(400);
    return res.status(200).json(neutral);
  }

  // Decide token type by current state:
  //   - no password yet → setup token (validated by passwordHash == null)
  //   - already set → reset token with rotated nonce
  let token;
  if (!entry.passwordHash) {
    token = issueToken({ email: entry.email, purpose: 'setup' });
  } else {
    const nonce = crypto.randomBytes(8).toString('hex');
    updateEntry(registry, entry.email, { resetNonce: nonce });
    try { await saveRegistry(drive, fileId, registry); } catch (err) {
      console.warn('portal-forgot: saving nonce failed', err);
    }
    token = issueToken({ email: entry.email, purpose: 'reset', nonce });
  }

  sendSetupLink({ to: entry.email, name: entry.name, token }).catch(err =>
    console.warn('portal-forgot: send failed', err)
  );

  return res.status(200).json(neutral);
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
