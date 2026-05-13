// Single catch-all dispatcher for the entire Investor Portal.
//
// Why: Vercel Hobby plan allows max 12 serverless functions per deployment.
// We consolidate ~16 portal endpoints behind one file to stay under that limit
// without losing any functionality. The dispatcher reads req.url, parses the
// sub-route, and calls the appropriate handler.
//
// Routes (relative to /api/portal/):
//   GET  ""                    → render investor portal HTML (uses /portal rewrite)
//   GET  "admin"               → render admin dashboard HTML
//   GET  "admin/sign"          → render Lukas's signing HTML
//   GET  "setup"               → render password-setup HTML (or expired page)
//   GET  "me"                  → current session info
//   GET  "roster"              → admin-only investor list
//   GET  "folder"              → file list inside an investor's Drive folder
//   GET  "logout"              → clear cookie + redirect to /
//   POST "login"               → email + password sign-in
//   POST "setup"               → save password
//   POST "forgot"              → email a fresh setup/reset link
//   POST "sign-as-lukas"       → Lukas signs Debtor + Guarantor
//   POST "sign"                → investor counter-signs as Creditor
//   POST "upload"              → upload a file to investor's folder
//   POST "add-investor"        → admin: create investor + upload blank PDF
//   POST "remove-investor"     → admin: soft-delete investor
//   POST "resend-link"         → admin: send fresh setup/reset link to investor

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import formidable from 'formidable';
import {
  loadRegistry,
  findByEmail,
  normalizeEmail,
  saveRegistry,
  updateEntry,
  createInvestorFolder,
  uploadFile,
  downloadFile,
  listFolderFiles
} from '../_portal-registry.js';
import {
  hashPassword,
  verifyPassword,
  issueToken,
  verifyToken,
  setSessionCookie,
  clearSessionCookie,
  verifyPortalSession
} from '../_portal-auth.js';
import { signAsLukas, signAsInvestor, applyFieldsForSigner } from '../_promissory-sign.js';
import {
  sendSetupLink,
  sendLukasNewNoteNotice,
  sendInvestorReadyToSign,
  sendExecutedCopy,
  sendKevinInvestorSignedNotice,
  sendSignerInvite
} from '../_portal-email.js';

// We handle body parsing ourselves so that multipart endpoints (upload,
// add-investor) work alongside JSON endpoints in the same function.
export const config = { api: { bodyParser: false } };

const LUKAS_EMAIL = 'bondysconstruction@gmail.com';
const KEVIN_EMAIL = 'Kevin@AKCapital.fund';

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  // Strip /api/portal/ or /portal/ prefix to get the sub-route
  const slug = url.pathname.replace(/^\/?api\/portal\/?/, '').replace(/^\/?portal\/?/, '').replace(/^\//, '').replace(/\/$/, '');
  const route = slug; // e.g. "admin/sign", "roster", "login"

  try {
    if (req.method === 'GET') {
      if (route === '' || route === 'index') return renderInvestorPortal(req, res);
      if (route === 'sign-in') return renderSignInPage(req, res);
      if (route === 'admin') return renderAdminDashboard(req, res);
      if (route === 'admin/sign') return renderAdminSign(req, res);
      if (route === 'setup') return getSetupPage(req, res);
      if (route === 'me') return getMe(req, res);
      if (route === 'roster') return getRoster(req, res);
      if (route === 'folder') return getFolder(req, res);
      if (route === 'logout') return doLogout(req, res);
      if (route === 'enter-data-room') return enterDataRoom(req, res);
      if (route === 'signing-plan') return await getSigningPlan(req, res);
      if (route === 'signer') return renderSignerPage(req, res);
      if (route === 'signer-task') return await getSignerTask(req, res);
      if (route === 'blank-pdf') return await getBlankPdf(req, res);
    }
    if (req.method === 'POST') {
      if (route === 'login') return await postLogin(req, res);
      if (route === 'setup') return await postSetup(req, res);
      if (route === 'forgot') return await postForgot(req, res);
      if (route === 'sign-as-lukas') return await postSignAsLukas(req, res);
      if (route === 'sign') return await postSignAsInvestor(req, res);
      if (route === 'upload') return await postUpload(req, res);
      if (route === 'add-investor') return await postAddInvestor(req, res);
      if (route === 'remove-investor') return await postRemoveInvestor(req, res);
      if (route === 'resend-link') return await postResendLink(req, res);
      if (route === 'save-signing-plan') return await postSaveSigningPlan(req, res);
      if (route === 'start-signing') return await postStartSigning(req, res);
      if (route === 'signer-sign') return await postSignerSign(req, res);
    }
    return res.status(404).json({ ok: false, message: 'Not found', route });
  } catch (err) {
    console.error('portal dispatcher error', route, err);
    return res.status(500).json({ ok: false, message: 'Server error.' });
  }
}

// ---------- Body helpers ----------

async function readJsonBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

async function readMultipart(req) {
  const form = formidable({ multiples: false, maxFileSize: 25 * 1024 * 1024 });
  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => err ? reject(err) : resolve({ fields, files }));
  });
}

function firstVal(v) { return Array.isArray(v) ? v[0] : v; }
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function parsePrincipal(v) {
  if (v == null) return null;
  const n = Math.round(parseFloat(String(v).replace(/[^0-9.]/g, '')));
  return Number.isFinite(n) && n > 0 ? n : null;
}
function slugify(s) {
  return String(s || 'investor').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

// ---------- Page renderers ----------

function servePublicFile(res, filename) {
  const p = path.join(process.cwd(), 'public', filename);
  const html = fs.readFileSync(p, 'utf-8');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).send(html);
}

function renderInvestorPortal(req, res) {
  const session = verifyPortalSession(req);
  if (!session) { res.writeHead(302, { Location: '/portal/sign-in' }); return res.end(); }
  if (session.role === 'admin') { res.writeHead(302, { Location: '/portal/admin' }); return res.end(); }
  return servePublicFile(res, 'portal.html');
}

function renderSignInPage(req, res) {
  // If already signed in, skip the form and route them to their portal
  const session = verifyPortalSession(req);
  if (session) {
    res.writeHead(302, { Location: session.role === 'admin' ? '/portal/admin' : '/portal' });
    return res.end();
  }
  return servePublicFile(res, 'portal-signin.html');
}

function renderAdminDashboard(req, res) {
  const session = verifyPortalSession(req);
  if (!session) { res.writeHead(302, { Location: '/portal/sign-in' }); return res.end(); }
  if (session.role !== 'admin') { res.writeHead(302, { Location: '/portal' }); return res.end(); }
  return servePublicFile(res, 'portal-admin.html');
}

function renderSignerPage(req, res) {
  // Public route — no session required; token validates downstream.
  return servePublicFile(res, 'portal-signer.html');
}

function renderAdminSign(req, res) {
  const session = verifyPortalSession(req);
  if (!session) { res.writeHead(302, { Location: '/portal/sign-in' }); return res.end(); }
  if (session.role !== 'admin') { res.writeHead(302, { Location: '/portal' }); return res.end(); }
  return servePublicFile(res, 'portal-admin-sign.html');
}

async function getSetupPage(req, res) {
  const token = (new URL(req.url, 'http://x').searchParams.get('token') || '').toString();
  const decoded = verifyToken(token);
  let blocked = !decoded;
  let reason = !decoded ? 'invalid' : null;

  if (decoded) {
    try {
      const { registry } = await loadRegistry();
      const entry = findByEmail(registry, decoded.email);
      if (!entry) { blocked = true; reason = 'invalid'; }
      else if (decoded.purpose === 'setup' && entry.passwordHash) { blocked = true; reason = 'already-used'; }
      else if (decoded.purpose === 'reset' && (!entry.resetNonce || entry.resetNonce !== decoded.nonce)) { blocked = true; reason = 'expired'; }
      else if (!['setup', 'reset'].includes(decoded.purpose)) { blocked = true; reason = 'invalid'; }
    } catch {
      blocked = true; reason = 'server';
    }
  }

  if (blocked) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(expiredPage(reason));
  }
  return servePublicFile(res, 'portal-setup.html');
}

function getMe(req, res) {
  const session = verifyPortalSession(req);
  if (!session) return res.status(401).json({ ok: false });
  return loadRegistry().then(({ registry }) => {
    const entry = findByEmail(registry, session.email, { includeDeleted: true });
    // For investors, return their full registry record so the portal page can
    // render terms, status, and document state without a second round-trip.
    const investor = entry && entry.role === 'investor' ? {
      name: entry.name,
      email: entry.email,
      principal: entry.principal,
      rate: entry.rate,
      termMonths: entry.termMonths,
      folderId: entry.folderId,
      blankPdfId: entry.blankPdfId || null,
      lukasSignedAt: entry.lukasSignedAt || null,
      lukasSignedPdfId: entry.lukasSignedPdfId || null,
      signedAt: entry.signedAt || null,
      signedPdfId: entry.signedPdfId || null,
      deletedAt: entry.deletedAt || null
    } : null;
    return res.status(200).json({
      ok: true, email: session.email, role: session.role,
      name: entry?.name || '', investor
    });
  }).catch(() => res.status(200).json({ ok: true, email: session.email, role: session.role, name: '' }));
}

function doLogout(req, res) {
  clearSessionCookie(res);
  res.writeHead(302, { Location: '/' });
  return res.end();
}

// GET /portal/enter-data-room — bridges an authenticated portal session into a
// data-room session. Committed investors and admins skip the password gate
// here because they've already authenticated to the portal.
function enterDataRoom(req, res) {
  const session = verifyPortalSession(req);
  if (!session) { res.writeHead(302, { Location: '/portal/sign-in' }); return res.end(); }
  const sessionSecret = process.env.SESSION_SECRET || 'change-me';
  const expires = Date.now() + (1000 * 60 * 60 * 24 * 7);
  const signature = crypto.createHmac('sha256', sessionSecret).update(String(expires)).digest('base64');
  const cookieValue = `${expires}.${signature}`;
  res.setHeader('Set-Cookie',
    `avenue_session=${cookieValue}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`);
  res.writeHead(302, { Location: '/room' });
  return res.end();
}

// ---------- Login ----------

async function postLogin(req, res) {
  const body = await readJsonBody(req);
  const email = normalizeEmail(body?.email);
  const password = String(body?.password || '');
  if (!email || !password) {
    await delay(400);
    return res.status(200).json({ ok: false, message: 'Please enter your email and password.' });
  }
  let registry, fileId, drive;
  try { ({ registry, fileId, drive } = await loadRegistry()); }
  catch (err) {
    console.error('login: registry load failed', err);
    return res.status(500).json({ ok: false, message: 'Server not configured.' });
  }
  const entry = findByEmail(registry, email);
  if (!entry) { await delay(600); return res.status(401).json({ ok: false, message: 'Email or password is incorrect.' }); }
  if (!entry.passwordHash) {
    const token = issueToken({ email: entry.email, purpose: 'setup' });
    sendSetupLink({ to: entry.email, name: entry.name, token })
      .catch(err => console.warn('login: setup email failed', err));
    return res.status(200).json({ ok: true, needsSetup: true, message: 'Check your inbox — we just emailed you a link to set your password.' });
  }
  if (!verifyPassword(password, entry.passwordHash)) {
    await delay(600);
    return res.status(401).json({ ok: false, message: 'Email or password is incorrect.' });
  }
  setSessionCookie(res, { email: entry.email, role: entry.role });
  if (!entry.resetNonce) {
    entry.resetNonce = crypto.randomBytes(8).toString('hex');
    try { await saveRegistry(drive, fileId, registry); } catch {}
  }
  return res.status(200).json({ ok: true, redirect: entry.role === 'admin' ? '/portal/admin' : '/portal' });
}

// ---------- Setup (POST) ----------

async function postSetup(req, res) {
  const body = await readJsonBody(req);
  const token = String(body?.token || '');
  const password = String(body?.password || '');
  const confirm = String(body?.confirmPassword || '');
  if (password !== confirm) return res.status(400).json({ ok: false, message: 'Passwords do not match.' });
  if (password.length < 10) return res.status(400).json({ ok: false, message: 'Password must be at least 10 characters.' });

  const decoded = verifyToken(token);
  if (!decoded) return res.status(400).json({ ok: false, message: 'This link is invalid. Request a new one from the gate.' });

  let registry, fileId, drive;
  try { ({ registry, fileId, drive } = await loadRegistry()); }
  catch (err) {
    console.error('setup: registry load failed', err);
    return res.status(500).json({ ok: false, message: 'Server not configured.' });
  }

  const entry = findByEmail(registry, decoded.email);
  if (!entry) return res.status(400).json({ ok: false, message: 'This link is no longer valid.' });

  if (password.toLowerCase() === decoded.email.toLowerCase()) {
    return res.status(400).json({ ok: false, message: 'Password cannot be the same as your email.' });
  }

  if (decoded.purpose === 'setup') {
    if (entry.passwordHash) return res.status(400).json({ ok: false, message: 'You already have a password. Use "Forgot password?" on the gate.' });
  } else if (decoded.purpose === 'reset') {
    if (!entry.resetNonce || entry.resetNonce !== decoded.nonce) {
      return res.status(400).json({ ok: false, message: 'This link has expired. Request a new one.' });
    }
  } else {
    return res.status(400).json({ ok: false, message: 'Invalid link.' });
  }

  updateEntry(registry, entry.email, {
    passwordHash: hashPassword(password),
    passwordCreatedAt: new Date().toISOString(),
    resetNonce: crypto.randomBytes(8).toString('hex')
  });
  await saveRegistry(drive, fileId, registry);
  setSessionCookie(res, { email: entry.email, role: entry.role });
  return res.status(200).json({ ok: true, redirect: entry.role === 'admin' ? '/portal/admin' : '/portal' });
}

// ---------- Forgot ----------

async function postForgot(req, res) {
  const body = await readJsonBody(req);
  const email = normalizeEmail(body?.email);
  const neutral = { ok: true, message: 'If that email is registered, a sign-in link is on its way.' };
  if (!email) return res.status(200).json(neutral);

  let registry, fileId, drive;
  try { ({ registry, fileId, drive } = await loadRegistry()); }
  catch (err) {
    console.error('forgot: registry load failed', err);
    return res.status(200).json(neutral);
  }
  const entry = findByEmail(registry, email);
  if (!entry) { await delay(400); return res.status(200).json(neutral); }

  let token;
  if (!entry.passwordHash) {
    token = issueToken({ email: entry.email, purpose: 'setup' });
  } else {
    const nonce = crypto.randomBytes(8).toString('hex');
    updateEntry(registry, entry.email, { resetNonce: nonce });
    try { await saveRegistry(drive, fileId, registry); } catch (err) { console.warn('forgot: save failed', err); }
    token = issueToken({ email: entry.email, purpose: 'reset', nonce });
  }
  sendSetupLink({ to: entry.email, name: entry.name, token })
    .catch(err => console.warn('forgot: email failed', err));
  return res.status(200).json(neutral);
}

// ---------- Roster (admin) ----------

async function getRoster(req, res) {
  const session = verifyPortalSession(req);
  if (!session || session.role !== 'admin') return res.status(401).json({ ok: false, message: 'Unauthorized' });
  let registry;
  try { ({ registry } = await loadRegistry()); }
  catch (err) {
    console.error('roster: registry load failed', err);
    return res.status(500).json({ ok: false, message: 'Server not configured.' });
  }
  const investors = registry.entries.filter(e => e.role === 'investor').map(e => ({
    name: e.name, email: e.email, principal: e.principal, rate: e.rate, termMonths: e.termMonths,
    folderId: e.folderId, blankPdfId: e.blankPdfId,
    lukasSignedAt: e.lukasSignedAt || null, signedAt: e.signedAt || null,
    passwordCreatedAt: e.passwordCreatedAt || null, deletedAt: e.deletedAt || null,
    state: e.deletedAt ? 'removed' : (e.signedAt ? 'fully-executed' : (e.lukasSignedAt ? 'awaiting-investor' : 'awaiting-lukas'))
  }));
  const admins = registry.entries.filter(e => e.role === 'admin').map(e => ({
    name: e.name, email: e.email, hasPassword: !!e.passwordHash
  }));
  return res.status(200).json({ ok: true, investors, admins, updatedAt: registry.updatedAt });
}

// ---------- Folder list ----------

async function getFolder(req, res) {
  const session = verifyPortalSession(req);
  if (!session) return res.status(401).json({ ok: false, message: 'Unauthorized' });
  let registry, drive;
  try { ({ registry, drive } = await loadRegistry()); }
  catch (err) {
    console.error('folder: registry load failed', err);
    return res.status(500).json({ ok: false, message: 'Server not configured.' });
  }
  const requested = normalizeEmail((new URL(req.url, 'http://x').searchParams.get('email')) || '');
  const targetEmail = session.role === 'admin' ? (requested || session.email) : session.email;
  const entry = findByEmail(registry, targetEmail);
  if (!entry || entry.role !== 'investor') return res.status(404).json({ ok: false, message: 'Investor not found.' });
  if (entry.deletedAt && session.role !== 'admin') return res.status(403).json({ ok: false, message: 'Access revoked.' });

  let files = [];
  if (entry.folderId) {
    try { files = await listFolderFiles(drive, entry.folderId); }
    catch (err) { console.error('folder: list failed', err); }
  }
  return res.status(200).json({
    ok: true,
    investor: {
      name: entry.name, email: entry.email, principal: entry.principal, rate: entry.rate,
      termMonths: entry.termMonths,
      lukasSignedAt: entry.lukasSignedAt || null,
      signedAt: entry.signedAt || null
    },
    files: files.map(f => ({
      id: f.id, name: f.name, mimeType: f.mimeType, createdTime: f.createdTime,
      url: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`
    }))
  });
}

// ---------- Sign as Lukas ----------

async function postSignAsLukas(req, res) {
  const session = verifyPortalSession(req);
  if (!session || session.role !== 'admin') return res.status(401).json({ ok: false, message: 'Unauthorized' });
  if (normalizeEmail(session.email) !== normalizeEmail(LUKAS_EMAIL)) {
    return res.status(403).json({ ok: false, message: 'Only Lukas Bondy can sign as Debtor & Guarantor.' });
  }
  const body = await readJsonBody(req);
  const email = normalizeEmail(body?.email);
  const typedSignature = String(body?.typedSignature || '').trim();
  const agreed = !!body?.agreed;
  if (!email) return res.status(400).json({ ok: false, message: 'Investor email is required.' });
  if (!agreed) return res.status(400).json({ ok: false, message: 'You must acknowledge the terms.' });
  if (typedSignature.toLowerCase() !== 'lukas bondy') {
    return res.status(400).json({ ok: false, message: 'Typed signature must be "Lukas Bondy".' });
  }

  let registry, fileId, drive;
  try { ({ registry, fileId, drive } = await loadRegistry()); }
  catch (err) {
    console.error('sign-as-lukas: registry load failed', err);
    return res.status(500).json({ ok: false, message: 'Server not configured.' });
  }
  const entry = findByEmail(registry, email);
  if (!entry || entry.role !== 'investor') return res.status(404).json({ ok: false, message: 'Investor not found.' });
  if (entry.deletedAt) return res.status(400).json({ ok: false, message: 'Investor has been removed.' });
  if (entry.lukasSignedAt) return res.status(409).json({ ok: false, message: 'You have already signed this note.' });
  if (!entry.blankPdfId) return res.status(400).json({ ok: false, message: 'No blank PDF on file for this investor.' });

  let signedBytes;
  try {
    const blankBytes = await downloadFile(drive, entry.blankPdfId);
    signedBytes = await signAsLukas(blankBytes, { typedSignature: 'Lukas Bondy', dateIso: new Date().toISOString() });
  } catch (err) {
    console.error('sign-as-lukas: signing failed', err);
    return res.status(500).json({ ok: false, message: 'Could not sign PDF.' });
  }
  let uploaded;
  try {
    uploaded = await uploadFile(drive, entry.folderId, 'lukas-signed-promissory-note.pdf', 'application/pdf', signedBytes);
  } catch (err) {
    console.error('sign-as-lukas: upload failed', err);
    return res.status(500).json({ ok: false, message: 'Could not save signed PDF to Drive.' });
  }
  updateEntry(registry, email, { lukasSignedAt: new Date().toISOString(), lukasSignedPdfId: uploaded.id });
  await saveRegistry(drive, fileId, registry);

  let setupToken = null;
  if (!entry.passwordHash) setupToken = issueToken({ email: entry.email, purpose: 'setup' });
  sendInvestorReadyToSign({
    to: entry.email, name: entry.name, principal: entry.principal,
    needsSetup: !entry.passwordHash, setupToken
  }).catch(err => console.warn('sign-as-lukas: notify investor failed', err));
  return res.status(200).json({ ok: true });
}

// ---------- Investor counter-sign ----------

async function postSignAsInvestor(req, res) {
  const session = verifyPortalSession(req);
  if (!session || session.role !== 'investor') return res.status(401).json({ ok: false, message: 'Unauthorized' });
  const body = await readJsonBody(req);
  const typedSignature = String(body?.typedSignature || '').trim();
  const agreed = !!body?.agreed;
  if (!agreed) return res.status(400).json({ ok: false, message: 'You must acknowledge the terms.' });
  if (!typedSignature) return res.status(400).json({ ok: false, message: 'Typed signature is required.' });

  let registry, fileId, drive;
  try { ({ registry, fileId, drive } = await loadRegistry()); }
  catch (err) {
    console.error('sign: registry load failed', err);
    return res.status(500).json({ ok: false, message: 'Server not configured.' });
  }
  const entry = findByEmail(registry, session.email);
  if (!entry || entry.role !== 'investor') return res.status(404).json({ ok: false, message: 'Investor not found.' });
  if (entry.deletedAt) return res.status(403).json({ ok: false, message: 'Access revoked.' });
  if (typedSignature.toLowerCase() !== String(entry.name || '').toLowerCase()) {
    return res.status(400).json({ ok: false, message: 'Typed signature must match your full legal name on file.' });
  }
  if (entry.signedAt) return res.status(409).json({ ok: false, message: 'You have already signed this note.' });
  if (!entry.lukasSignedAt || !entry.lukasSignedPdfId) {
    return res.status(409).json({ ok: false, message: 'Your note is not yet ready to sign. Lukas must sign first.' });
  }

  let signedBytes;
  try {
    const lukasBytes = await downloadFile(drive, entry.lukasSignedPdfId);
    signedBytes = await signAsInvestor(lukasBytes, { typedSignature: entry.name, dateIso: new Date().toISOString() });
  } catch (err) {
    console.error('sign: signing failed', err);
    return res.status(500).json({ ok: false, message: 'Could not sign PDF.' });
  }
  let uploaded;
  try {
    uploaded = await uploadFile(drive, entry.folderId, 'signed-promissory-note.pdf', 'application/pdf', signedBytes);
  } catch (err) {
    console.error('sign: upload failed', err);
    return res.status(500).json({ ok: false, message: 'Could not save executed PDF.' });
  }
  updateEntry(registry, entry.email, { signedAt: new Date().toISOString(), signedPdfId: uploaded.id });
  await saveRegistry(drive, fileId, registry);

  sendExecutedCopy({
    to: entry.email, name: entry.name, principal: entry.principal,
    pdfBytes: signedBytes, pdfFilename: `${slugify(entry.name)}-promissory-note-executed.pdf`,
    bcc: KEVIN_EMAIL
  }).catch(err => console.warn('sign: investor email failed', err));
  sendKevinInvestorSignedNotice({
    to: KEVIN_EMAIL, investorName: entry.name, principal: entry.principal
  }).catch(err => console.warn('sign: Kevin notify failed', err));
  return res.status(200).json({ ok: true });
}

// ---------- Upload (subscription docs) ----------

async function postUpload(req, res) {
  const session = verifyPortalSession(req);
  if (!session) return res.status(401).json({ ok: false, message: 'Unauthorized' });
  let fields, files;
  try { ({ fields, files } = await readMultipart(req)); }
  catch (err) {
    console.error('upload: parse failed', err);
    return res.status(400).json({ ok: false, message: 'Upload failed. Files must be under 25MB.' });
  }
  const file = Array.isArray(files.file) ? files.file[0] : files.file;
  if (!file) return res.status(400).json({ ok: false, message: 'No file provided.' });

  let targetEmail = session.email;
  if (session.role === 'admin') {
    targetEmail = normalizeEmail(firstVal(fields.target)) || targetEmail;
  }
  let registry, drive;
  try { ({ registry, drive } = await loadRegistry()); }
  catch (err) {
    console.error('upload: registry load failed', err);
    return res.status(500).json({ ok: false, message: 'Server not configured.' });
  }
  const entry = findByEmail(registry, targetEmail);
  if (!entry || entry.role !== 'investor' || !entry.folderId) {
    return res.status(404).json({ ok: false, message: 'Folder not found.' });
  }
  if (entry.deletedAt && session.role !== 'admin') return res.status(403).json({ ok: false, message: 'Access revoked.' });

  const buf = fs.readFileSync(file.filepath);
  const mimeType = file.mimetype || 'application/octet-stream';
  const filename = file.originalFilename || file.newFilename || 'upload';
  try {
    const uploaded = await uploadFile(drive, entry.folderId, filename, mimeType, buf);
    return res.status(200).json({ ok: true, file: { id: uploaded.id, name: uploaded.name } });
  } catch (err) {
    console.error('upload: drive write failed', err);
    return res.status(500).json({ ok: false, message: 'Could not save file.' });
  }
}

// ---------- Add investor (admin) ----------

async function postAddInvestor(req, res) {
  const session = verifyPortalSession(req);
  if (!session || session.role !== 'admin') return res.status(401).json({ ok: false, message: 'Unauthorized' });

  let fields, files;
  try { ({ fields, files } = await readMultipart(req)); }
  catch (err) {
    console.error('add-investor: parse failed', err);
    return res.status(400).json({ ok: false, message: 'Could not parse form.' });
  }

  const name = String(firstVal(fields.name) || '').trim();
  const email = normalizeEmail(firstVal(fields.email));
  const principal = parsePrincipal(firstVal(fields.principal));
  const rate = String(firstVal(fields.rate) || '20% per annum').trim();
  const termMonths = parseInt(String(firstVal(fields.termMonths) || '20'), 10) || 20;
  const file = Array.isArray(files.blankPdf) ? files.blankPdf[0] : files.blankPdf;

  if (!name) return res.status(400).json({ ok: false, message: 'Name is required.' });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ ok: false, message: 'Valid email is required.' });
  if (!principal) return res.status(400).json({ ok: false, message: 'Principal must be a positive number.' });
  if (!file) return res.status(400).json({ ok: false, message: 'Blank PDF is required.' });

  let registry, fileId, drive;
  try { ({ registry, fileId, drive } = await loadRegistry()); }
  catch (err) {
    console.error('add-investor: registry load failed', err);
    return res.status(500).json({ ok: false, message: 'Server not configured.' });
  }
  if (findByEmail(registry, email)) {
    return res.status(409).json({ ok: false, message: 'An investor with that email already exists.' });
  }

  const pdfBytes = fs.readFileSync(file.filepath);
  let folder, uploaded;
  try {
    folder = await createInvestorFolder(drive, name);
    uploaded = await uploadFile(drive, folder.id, 'blank-promissory-note.pdf', 'application/pdf', pdfBytes);
  } catch (err) {
    console.error('add-investor: drive write failed', err);
    return res.status(500).json({ ok: false, message: 'Could not save to Drive.' });
  }

  registry.entries.push({
    role: 'investor',
    name, email, principal, rate, termMonths,
    folderId: folder.id, blankPdfId: uploaded.id,
    passwordHash: null, passwordCreatedAt: null, resetNonce: null,
    lukasSignedAt: null, lukasSignedPdfId: null,
    signedAt: null, signedPdfId: null, deletedAt: null
  });
  await saveRegistry(drive, fileId, registry);

  sendLukasNewNoteNotice({ to: LUKAS_EMAIL, investorName: name, principal })
    .catch(err => console.warn('add-investor: Lukas email failed', err));

  return res.status(200).json({ ok: true, investor: { name, email, principal, folderId: folder.id } });
}

// ---------- Remove investor (admin) ----------

async function postRemoveInvestor(req, res) {
  const session = verifyPortalSession(req);
  if (!session || session.role !== 'admin') return res.status(401).json({ ok: false, message: 'Unauthorized' });
  const body = await readJsonBody(req);
  const email = normalizeEmail(body?.email);
  if (!email) return res.status(400).json({ ok: false, message: 'Email is required.' });

  let registry, fileId, drive;
  try { ({ registry, fileId, drive } = await loadRegistry()); }
  catch (err) {
    console.error('remove: registry load failed', err);
    return res.status(500).json({ ok: false, message: 'Server not configured.' });
  }
  const entry = findByEmail(registry, email);
  if (!entry || entry.role !== 'investor') return res.status(404).json({ ok: false, message: 'Investor not found.' });
  updateEntry(registry, email, {
    deletedAt: new Date().toISOString(),
    passwordHash: null,
    resetNonce: null
  });
  await saveRegistry(drive, fileId, registry);
  return res.status(200).json({ ok: true });
}

// ---------- Resend link (admin) ----------

async function postResendLink(req, res) {
  const session = verifyPortalSession(req);
  if (!session || session.role !== 'admin') return res.status(401).json({ ok: false, message: 'Unauthorized' });
  const body = await readJsonBody(req);
  const email = normalizeEmail(body?.email);
  const kind = String(body?.kind || 'setup');
  if (!email) return res.status(400).json({ ok: false, message: 'Email is required.' });

  let registry, fileId, drive;
  try { ({ registry, fileId, drive } = await loadRegistry()); }
  catch (err) {
    console.error('resend: registry load failed', err);
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
    if (!entry.lukasSignedAt) return res.status(409).json({ ok: false, message: 'Lukas has not signed this note yet.' });
    let setupToken = null;
    if (!entry.passwordHash) setupToken = issueToken({ email: entry.email, purpose: 'setup' });
    const result = await sendInvestorReadyToSign({
      to: entry.email, name: entry.name, principal: entry.principal,
      needsSetup: !entry.passwordHash, setupToken
    });
    if (!result.sent) return res.status(500).json({ ok: false, message: 'Email failed: ' + (result.reason || 'unknown') });
    return res.status(200).json({ ok: true });
  }
  return res.status(400).json({ ok: false, message: 'Unknown kind.' });
}

// ---------- Multi-signer signing plan ----------
//
// A signing plan lets the admin assign multiple signers to specific fields on
// the investor's blank PDF, with a sequential signing order. Stored on the
// investor entry as `signingPlan: { signers: [...], fields: [...] }`.
//
// signers:  [{ id, name, email, order, accessMethod: 'magic-link'|'account',
//              magicNonce?, signedAt?, role?: 'investor'|'admin'|'extra' }]
// fields:   [{ id, signerId, page, x, y, type, label? }]
//
// Signing flow:
//   1. Admin saves plan + clicks "Start signing" → first signer (order 0)
//      receives email with magic link.
//   2. Signer opens link, types their signature, submits.
//   3. Server overlays their fields onto the latest PDF, writes the partially
//      signed PDF back to the investor folder, advances order, emails next
//      signer. When all signers done, final PDF is saved + investor + admin
//      notified.

async function getSigningPlan(req, res) {
  const session = verifyPortalSession(req);
  if (!session || session.role !== 'admin') return res.status(401).json({ ok: false, message: 'Unauthorized' });
  const email = normalizeEmail((new URL(req.url, 'http://x').searchParams.get('email')) || '');
  let registry;
  try { ({ registry } = await loadRegistry()); }
  catch (err) {
    console.error('signing-plan: registry load failed', err);
    return res.status(500).json({ ok: false, message: 'Server not configured.' });
  }
  const entry = findByEmail(registry, email);
  if (!entry || entry.role !== 'investor') return res.status(404).json({ ok: false, message: 'Investor not found.' });
  return res.status(200).json({
    ok: true,
    investor: { name: entry.name, email: entry.email, blankPdfId: entry.blankPdfId || null },
    plan: entry.signingPlan || { signers: [], fields: [] }
  });
}

// Stream the investor's blank PDF for pdf.js rendering in admin / signer pages.
// Admins can fetch any investor's blank; investors can fetch their own;
// magic-link signers can fetch with a valid signer token.
async function getBlankPdf(req, res) {
  const u = new URL(req.url, 'http://x');
  const email = normalizeEmail(u.searchParams.get('email') || '');
  const token = u.searchParams.get('token') || '';
  const session = verifyPortalSession(req);

  let registry, drive;
  try { ({ registry, drive } = await loadRegistry()); }
  catch (err) {
    console.error('blank-pdf: registry load failed', err);
    return res.status(500).end();
  }

  let entry = null;
  if (token) {
    const decoded = verifyToken(token);
    if (!decoded || decoded.purpose !== 'sign-magic') return res.status(403).end();
    entry = findByEmail(registry, decoded.email);
    if (!entry || !entry.signingPlan) return res.status(404).end();
    const signer = (entry.signingPlan.signers || []).find(s => s.id === decoded.nonce.split(':')[0]);
    if (!signer || signer.magicNonce !== decoded.nonce) return res.status(403).end();
  } else {
    if (!session) return res.status(401).end();
    const target = (session.role === 'admin' && email) ? email : session.email;
    entry = findByEmail(registry, target);
    if (!entry || entry.role !== 'investor') return res.status(404).end();
  }
  if (!entry.blankPdfId) return res.status(404).end();

  // Always serve the latest in-progress PDF if one exists, so admins see field
  // placement against the current state and signers see prior signatures.
  const pdfId = entry.signingProgressPdfId || entry.lukasSignedPdfId || entry.blankPdfId;
  try {
    const bytes = await downloadFile(drive, pdfId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).end(Buffer.from(bytes));
  } catch (err) {
    console.error('blank-pdf: download failed', err);
    return res.status(500).end();
  }
}

async function postSaveSigningPlan(req, res) {
  const session = verifyPortalSession(req);
  if (!session || session.role !== 'admin') return res.status(401).json({ ok: false, message: 'Unauthorized' });
  const body = await readJsonBody(req);
  const email = normalizeEmail(body?.email);
  const signersIn = Array.isArray(body?.signers) ? body.signers : [];
  const fieldsIn = Array.isArray(body?.fields) ? body.fields : [];
  if (!email) return res.status(400).json({ ok: false, message: 'Investor email required.' });
  if (signersIn.length === 0) return res.status(400).json({ ok: false, message: 'At least one signer is required.' });

  let registry, fileId, drive;
  try { ({ registry, fileId, drive } = await loadRegistry()); }
  catch (err) {
    console.error('save-signing-plan: registry load failed', err);
    return res.status(500).json({ ok: false, message: 'Server not configured.' });
  }
  const entry = findByEmail(registry, email);
  if (!entry || entry.role !== 'investor') return res.status(404).json({ ok: false, message: 'Investor not found.' });
  if (entry.signingPlan && (entry.signingPlan.signers || []).some(s => s.signedAt)) {
    return res.status(409).json({ ok: false, message: 'Signing has already started; plan is locked.' });
  }

  // Sanitize signers — preserve existing signer ids when present so field ids
  // assigned to them stay valid.
  const existing = entry.signingPlan?.signers || [];
  const signers = signersIn.map((s, i) => {
    const prev = existing.find(p => p.id === s.id);
    const access = s.accessMethod === 'account' ? 'account' : 'magic-link';
    return {
      id: String(s.id || ('s_' + crypto.randomBytes(4).toString('hex'))),
      name: String(s.name || '').trim(),
      email: normalizeEmail(s.email),
      order: Number.isFinite(parseInt(s.order, 10)) ? parseInt(s.order, 10) : i,
      accessMethod: access,
      role: s.role || 'extra',
      magicNonce: prev?.magicNonce || null,
      signedAt: prev?.signedAt || null
    };
  }).filter(s => s.name && s.email);

  if (signers.length === 0) return res.status(400).json({ ok: false, message: 'Each signer needs a name and email.' });

  const validSignerIds = new Set(signers.map(s => s.id));
  const fields = fieldsIn
    .filter(f => validSignerIds.has(String(f.signerId)))
    .map(f => ({
      id: String(f.id || ('f_' + crypto.randomBytes(4).toString('hex'))),
      signerId: String(f.signerId),
      page: parseInt(f.page, 10) || 0,
      x: Number(f.x) || 0,
      y: Number(f.y) || 0,
      type: ['signature', 'date', 'name', 'title', 'initials'].includes(f.type) ? f.type : 'signature',
      label: String(f.label || '').slice(0, 60)
    }));

  updateEntry(registry, email, { signingPlan: { signers, fields } });
  await saveRegistry(drive, fileId, registry);
  return res.status(200).json({ ok: true });
}

// Admin trigger: emails the next pending signer their magic link.
// Idempotent — if the queue is empty, returns ok with a note.
async function postStartSigning(req, res) {
  const session = verifyPortalSession(req);
  if (!session || session.role !== 'admin') return res.status(401).json({ ok: false, message: 'Unauthorized' });
  const body = await readJsonBody(req);
  const email = normalizeEmail(body?.email);
  if (!email) return res.status(400).json({ ok: false, message: 'Investor email required.' });

  let registry, fileId, drive;
  try { ({ registry, fileId, drive } = await loadRegistry()); }
  catch (err) {
    console.error('start-signing: registry load failed', err);
    return res.status(500).json({ ok: false, message: 'Server not configured.' });
  }
  const entry = findByEmail(registry, email);
  if (!entry || entry.role !== 'investor') return res.status(404).json({ ok: false, message: 'Investor not found.' });
  if (!entry.signingPlan) return res.status(400).json({ ok: false, message: 'No signing plan saved yet.' });

  const result = await inviteNextSigner({ entry, registry, fileId, drive });
  if (!result.ok) return res.status(400).json(result);
  return res.status(200).json(result);
}

// Find the next signer in `order` who hasn't signed yet, mint their magic
// nonce, persist it, and email the invite. Returns { ok, done?, signer? }.
async function inviteNextSigner({ entry, registry, fileId, drive }) {
  const plan = entry.signingPlan;
  const sorted = [...(plan.signers || [])].sort((a, b) => a.order - b.order);
  const next = sorted.find(s => !s.signedAt);
  if (!next) {
    return { ok: true, done: true, message: 'All signers have completed.' };
  }
  // Issue a fresh magic nonce so a previous link is invalidated.
  next.magicNonce = `${next.id}:${crypto.randomBytes(8).toString('hex')}`;
  // Persist the updated nonce.
  const idx = plan.signers.findIndex(s => s.id === next.id);
  plan.signers[idx] = next;
  updateEntry(registry, entry.email, { signingPlan: plan });
  await saveRegistry(drive, fileId, registry);

  const token = issueToken({ email: entry.email, purpose: 'sign-magic', nonce: next.magicNonce });
  const link = `${process.env.PORTAL_BASE_URL || 'https://dataroom.theavenuefh.com'}/portal/signer?token=${encodeURIComponent(token)}`;
  const mailRes = await sendSignerInvite({
    to: next.email, signerName: next.name, investorName: entry.name,
    magicLink: link, accessMethod: next.accessMethod
  });
  if (!mailRes.sent) return { ok: false, message: 'Email failed: ' + (mailRes.reason || 'unknown') };
  return { ok: true, invited: { name: next.name, email: next.email } };
}

// Public: signer lands on /portal/signer?token=…, the page calls this to
// fetch their task. Returns the doc context + their assigned fields.
async function getSignerTask(req, res) {
  const token = (new URL(req.url, 'http://x').searchParams.get('token') || '').toString();
  const decoded = verifyToken(token);
  if (!decoded || decoded.purpose !== 'sign-magic') {
    return res.status(400).json({ ok: false, message: 'Invalid or expired signing link.' });
  }
  let registry;
  try { ({ registry } = await loadRegistry()); }
  catch (err) {
    console.error('signer-task: registry load failed', err);
    return res.status(500).json({ ok: false, message: 'Server not configured.' });
  }
  const entry = findByEmail(registry, decoded.email);
  if (!entry || !entry.signingPlan) return res.status(404).json({ ok: false, message: 'Document not found.' });
  const signerId = decoded.nonce.split(':')[0];
  const signer = entry.signingPlan.signers.find(s => s.id === signerId);
  if (!signer || signer.magicNonce !== decoded.nonce) {
    return res.status(403).json({ ok: false, message: 'This link is no longer valid.' });
  }
  if (signer.signedAt) {
    return res.status(409).json({ ok: false, message: 'You have already signed this document.' });
  }
  // Enforce sequential order — refuse if an earlier signer hasn't signed yet.
  const sorted = [...entry.signingPlan.signers].sort((a, b) => a.order - b.order);
  const earlierPending = sorted.find(s => s.order < signer.order && !s.signedAt);
  if (earlierPending) {
    return res.status(409).json({ ok: false, message: 'Waiting on a prior signer to complete first.' });
  }
  const fields = entry.signingPlan.fields.filter(f => f.signerId === signer.id);
  return res.status(200).json({
    ok: true,
    signer: { id: signer.id, name: signer.name, email: signer.email },
    investor: { name: entry.name },
    fields,
    pdfUrl: `/api/portal/blank-pdf?token=${encodeURIComponent(token)}`
  });
}

// Public: signer submits typed signature + optional name/title/initials.
// We overlay only that signer's fields onto the latest PDF, save it back, then
// either invite the next signer or finalize.
async function postSignerSign(req, res) {
  const body = await readJsonBody(req);
  const token = String(body?.token || '');
  const typedSignature = String(body?.typedSignature || '').trim();
  const nameInput = String(body?.name || '').trim();
  const titleInput = String(body?.title || '').trim();
  const initialsInput = String(body?.initials || '').trim();
  const agreed = !!body?.agreed;

  if (!agreed) return res.status(400).json({ ok: false, message: 'You must acknowledge the terms.' });
  if (!typedSignature) return res.status(400).json({ ok: false, message: 'Typed signature is required.' });

  const decoded = verifyToken(token);
  if (!decoded || decoded.purpose !== 'sign-magic') {
    return res.status(400).json({ ok: false, message: 'Invalid or expired signing link.' });
  }

  let registry, fileId, drive;
  try { ({ registry, fileId, drive } = await loadRegistry()); }
  catch (err) {
    console.error('signer-sign: registry load failed', err);
    return res.status(500).json({ ok: false, message: 'Server not configured.' });
  }
  const entry = findByEmail(registry, decoded.email);
  if (!entry || !entry.signingPlan) return res.status(404).json({ ok: false, message: 'Document not found.' });
  const signerId = decoded.nonce.split(':')[0];
  const plan = entry.signingPlan;
  const signerIdx = plan.signers.findIndex(s => s.id === signerId);
  const signer = signerIdx === -1 ? null : plan.signers[signerIdx];
  if (!signer || signer.magicNonce !== decoded.nonce) {
    return res.status(403).json({ ok: false, message: 'This link is no longer valid.' });
  }
  if (signer.signedAt) return res.status(409).json({ ok: false, message: 'You have already signed.' });
  const sorted = [...plan.signers].sort((a, b) => a.order - b.order);
  const earlierPending = sorted.find(s => s.order < signer.order && !s.signedAt);
  if (earlierPending) return res.status(409).json({ ok: false, message: 'Waiting on a prior signer.' });

  const myFields = plan.fields.filter(f => f.signerId === signer.id);
  if (myFields.length === 0) {
    // Nothing to draw — just mark signed and advance.
  }

  let signedBytes;
  try {
    const sourceId = entry.signingProgressPdfId || entry.blankPdfId;
    const bytes = await downloadFile(drive, sourceId);
    signedBytes = await applyFieldsForSigner(bytes, myFields, {
      typedSignature, name: nameInput || signer.name, title: titleInput,
      initials: initialsInput, dateIso: new Date().toISOString()
    });
  } catch (err) {
    console.error('signer-sign: overlay failed', err);
    return res.status(500).json({ ok: false, message: 'Could not apply signature.' });
  }

  // Determine if this is the final signer; choose filename accordingly.
  const isLast = sorted.every(s => s.id === signer.id || s.signedAt);
  const filename = isLast
    ? 'fully-executed-signed-document.pdf'
    : `signed-step-${signer.order + 1}-${slugify(signer.name)}.pdf`;

  let uploaded;
  try {
    uploaded = await uploadFile(drive, entry.folderId, filename, 'application/pdf', signedBytes);
  } catch (err) {
    console.error('signer-sign: upload failed', err);
    return res.status(500).json({ ok: false, message: 'Could not save signed PDF.' });
  }

  signer.signedAt = new Date().toISOString();
  signer.magicNonce = null; // consume the link
  plan.signers[signerIdx] = signer;
  const patch = { signingPlan: plan, signingProgressPdfId: uploaded.id };
  if (isLast) {
    patch.signedAt = patch.signedAt || new Date().toISOString();
    patch.signedPdfId = uploaded.id;
  }
  updateEntry(registry, entry.email, patch);
  await saveRegistry(drive, fileId, registry);

  if (isLast) {
    sendExecutedCopy({
      to: entry.email, name: entry.name, principal: entry.principal,
      pdfBytes: signedBytes, pdfFilename: `${slugify(entry.name)}-executed.pdf`,
      bcc: KEVIN_EMAIL
    }).catch(err => console.warn('signer-sign: executed copy email failed', err));
    sendKevinInvestorSignedNotice({
      to: KEVIN_EMAIL, investorName: entry.name, principal: entry.principal
    }).catch(err => console.warn('signer-sign: Kevin notify failed', err));
  } else {
    // Re-load fresh registry state then invite the next signer.
    await inviteNextSigner({ entry, registry, fileId, drive }).catch(err => {
      console.warn('signer-sign: next-signer invite failed', err);
    });
  }
  return res.status(200).json({ ok: true, done: isLast });
}

// ---------- Expired-link page ----------

function expiredPage(reason) {
  const msg = {
    'already-used': "Looks like you've already set a password. Sign in from the gate with your email and password instead.",
    'expired': 'This password-reset link has expired. Request a new one from the gate.',
    'invalid': 'This link is invalid. Request a new one from the gate.',
    'server': 'Something went wrong on our end. Please try again shortly.'
  }[reason] || 'This link is no longer valid.';
  return `<!DOCTYPE html><html><head>
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
<h1>Link unavailable</h1><p>${msg}</p><a href="/">← Back to sign-in</a>
</div></body></html>`;
}
