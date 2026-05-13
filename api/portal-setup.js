// GET /api/portal/setup?token=...
//   → serves public/portal-setup.html if the token is valid and the entry hasn't
//     already set a password (or the token is a reset token that matches the
//     entry's resetNonce). Otherwise an expired-link page.
//
// POST /api/portal/setup
//   Body: { token, password, confirmPassword }
//   → re-verifies token + state, hashes & saves the new password, issues session
//     cookie, returns { ok: true, redirect }.
import fs from 'fs';
import path from 'path';
import { loadRegistry, findByEmail, updateEntry, saveRegistry } from './_portal-registry.js';
import { verifyToken, hashPassword, setSessionCookie } from './_portal-auth.js';
import crypto from 'crypto';

const MIN_PASSWORD_LEN = 10;

export default async function handler(req, res) {
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);
  return res.status(405).json({ ok: false, message: 'Method not allowed' });
}

async function handleGet(req, res) {
  const token = (req.query?.token || '').toString();
  const { ok, reason } = await tokenOk(token);
  if (!ok) {
    return res.status(200)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .send(expiredPage(reason));
  }
  // Serve the setup HTML page
  const filePath = path.join(process.cwd(), 'public', 'portal-setup.html');
  const html = fs.readFileSync(filePath, 'utf-8');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).send(html);
}

async function handlePost(req, res) {
  const token = String(req.body?.token || '');
  const password = String(req.body?.password || '');
  const confirm = String(req.body?.confirmPassword || '');

  if (password !== confirm) {
    return res.status(400).json({ ok: false, message: 'Passwords do not match.' });
  }
  if (password.length < MIN_PASSWORD_LEN) {
    return res.status(400).json({ ok: false, message: `Password must be at least ${MIN_PASSWORD_LEN} characters.` });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(400).json({ ok: false, message: 'This link is invalid. Request a new one from the gate.' });
  }

  let registry, fileId, drive;
  try { ({ registry, fileId, drive } = await loadRegistry()); }
  catch (err) {
    console.error('portal-setup POST: load registry failed', err);
    return res.status(500).json({ ok: false, message: 'Server not configured.' });
  }

  const entry = findByEmail(registry, decoded.email);
  if (!entry) return res.status(400).json({ ok: false, message: 'This link is no longer valid.' });

  // password.toLowerCase() === decoded.email is a banned password (prevent trivial reuse)
  if (password.toLowerCase() === decoded.email.toLowerCase()) {
    return res.status(400).json({ ok: false, message: 'Password cannot be the same as your email.' });
  }

  // Enforce single-use:
  //   - setup tokens: only valid while passwordHash is null (initial setup)
  //   - reset tokens: only valid if decoded.nonce matches entry.resetNonce
  if (decoded.purpose === 'setup') {
    if (entry.passwordHash) {
      return res.status(400).json({ ok: false, message: 'You already have a password. Use "Forgot password?" on the gate to reset it.' });
    }
  } else if (decoded.purpose === 'reset') {
    if (!entry.resetNonce || entry.resetNonce !== decoded.nonce) {
      return res.status(400).json({ ok: false, message: 'This link has expired. Request a new one.' });
    }
  } else {
    return res.status(400).json({ ok: false, message: 'Invalid link.' });
  }

  // Hash + save
  const hash = hashPassword(password);
  updateEntry(registry, entry.email, {
    passwordHash: hash,
    passwordCreatedAt: new Date().toISOString(),
    resetNonce: crypto.randomBytes(8).toString('hex') // rotate so old reset link is dead
  });
  await saveRegistry(drive, fileId, registry);

  // Auto sign-in
  setSessionCookie(res, { email: entry.email, role: entry.role });
  return res.status(200).json({
    ok: true,
    redirect: entry.role === 'admin' ? '/portal/admin' : '/portal'
  });
}

// Check whether a token is structurally valid AND its single-use state allows
// it to be used right now. Used by GET to decide which page to show.
async function tokenOk(token) {
  const decoded = verifyToken(token);
  if (!decoded) return { ok: false, reason: 'invalid' };

  let registry;
  try { ({ registry } = await loadRegistry()); }
  catch { return { ok: false, reason: 'server' }; }

  const entry = findByEmail(registry, decoded.email);
  if (!entry) return { ok: false, reason: 'invalid' };

  if (decoded.purpose === 'setup' && entry.passwordHash) {
    return { ok: false, reason: 'already-used' };
  }
  if (decoded.purpose === 'reset' && (!entry.resetNonce || entry.resetNonce !== decoded.nonce)) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true };
}

function expiredPage(reason) {
  const msg = {
    'already-used': "Looks like you've already set a password. Sign in from the gate with your email and password instead.",
    'expired': 'This password-reset link has expired. Request a new one from the gate.',
    'invalid': 'This link is invalid. Request a new one from the gate.',
    'server': 'Something went wrong on our end. Please try again shortly.'
  }[reason] || 'This link is no longer valid.';
  return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Link unavailable · The Avenue</title>
<link rel="stylesheet" href="/styles.css">
<style>body{background:#1F4A52;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px;font-family:-apple-system,system-ui,sans-serif;color:rgba(255,255,255,.92)}
.card{max-width:440px;width:100%;background:rgba(15,38,42,.55);border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:38px;text-align:center}
h1{font-family:'Cormorant Garamond',Georgia,serif;color:white;font-size:26px;margin:0 0 12px}
p{color:rgba(255,255,255,.7);font-size:15px;line-height:1.55}
a{display:inline-block;margin-top:24px;background:#D4A24A;color:#1A1816;padding:13px 22px;border-radius:10px;text-decoration:none;font-weight:600}
a:hover{background:#BC8E3C}</style>
</head><body><div class="card">
<h1>Link unavailable</h1>
<p>${msg}</p>
<a href="/">← Back to sign-in</a>
</div></body></html>`;
}
