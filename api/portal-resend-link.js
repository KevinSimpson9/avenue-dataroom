// POST /api/portal/resend-link — admin-only.
// Body: { email, kind } where kind is "setup" (force-reset their password) or
// "ready-to-sign" (re-send the "your note is ready" email; only valid once
// lukasSignedAt is set).
import { requireAdmin } from './_portal-auth.js';
import { loadRegistry, findByEmail, normalizeEmail, updateEntry, saveRegistry } from './_portal-registry.js';
import { issueToken } from './_portal-auth.js';
import { sendSetupLink, sendInvestorReadyToSign } from './_portal-email.js';
import crypto from 'crypto';

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method not allowed' });

  const email = normalizeEmail(req.body?.email);
  const kind = String(req.body?.kind || 'setup');
  if (!email) return res.status(400).json({ ok: false, message: 'Email is required.' });

  let registry, fileId, drive;
  try { ({ registry, fileId, drive } = await loadRegistry()); }
  catch (err) {
    console.error('portal-resend-link: load registry failed', err);
    return res.status(500).json({ ok: false, message: 'Server not configured.' });
  }

  const entry = findByEmail(registry, email);
  if (!entry) return res.status(404).json({ ok: false, message: 'Email not found.' });
  if (entry.deletedAt) return res.status(400).json({ ok: false, message: 'Investor has been removed.' });

  if (kind === 'setup') {
    let token;
    if (!entry.passwordHash) {
      token = issueToken({ email: entry.email, purpose: 'setup' });
    } else {
      const nonce = crypto.randomBytes(8).toString('hex');
      updateEntry(registry, email, { resetNonce: nonce });
      await saveRegistry(drive, fileId, registry);
      token = issueToken({ email: entry.email, purpose: 'reset', nonce });
    }
    const result = await sendSetupLink({ to: entry.email, name: entry.name, token });
    if (!result.sent) return res.status(500).json({ ok: false, message: 'Email failed: ' + (result.reason || 'unknown') });
    return res.status(200).json({ ok: true });
  }

  if (kind === 'ready-to-sign') {
    if (!entry.lukasSignedAt) {
      return res.status(409).json({ ok: false, message: 'Lukas has not signed this note yet.' });
    }
    let setupToken = null;
    if (!entry.passwordHash) {
      setupToken = issueToken({ email: entry.email, purpose: 'setup' });
    }
    const result = await sendInvestorReadyToSign({
      to: entry.email,
      name: entry.name,
      principal: entry.principal,
      needsSetup: !entry.passwordHash,
      setupToken
    });
    if (!result.sent) return res.status(500).json({ ok: false, message: 'Email failed: ' + (result.reason || 'unknown') });
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ ok: false, message: 'Unknown kind.' });
}
