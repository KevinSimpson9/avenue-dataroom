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
//   GET  "setup"               → render password-setup HTML (or expired page)
//   GET  "me"                  → current session info
//   GET  "roster"              → admin-only investor list
//   GET  "folder"              → file list inside an investor's Drive folder
//   GET  "logout"              → clear cookie + redirect to /
//   POST "login"               → email + password sign-in
//   POST "setup"               → save password
//   POST "forgot"              → email a fresh setup/reset link
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
import {
  sendSetupLink,
  sendLukasNewNoteNotice,
  sendEnvelopeInvite,
  sendEnvelopeExecutedCopy
} from '../_portal-email.js';
import {
  loadEnvelopes,
  saveEnvelopes,
  findEnvelope,
  findRecipient,
  getOrCreateEnvelopesFolder
} from '../_envelopes-registry.js';
import { flattenEnvelope, todayLong } from '../_envelope-sign.js';

function sha256Hex(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

// We handle body parsing ourselves so that multipart endpoints (upload,
// add-investor) work alongside JSON endpoints in the same function.
export const config = { api: { bodyParser: false } };

const LUKAS_EMAIL = 'bondysconstruction@gmail.com';
const KEVIN_EMAIL = 'Kevin@AKCapital.fund';

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  // Strip /api/portal/ or /portal/ prefix to get the sub-route
  const slug = url.pathname.replace(/^\/?api\/portal\/?/, '').replace(/^\/?portal\/?/, '').replace(/^\//, '').replace(/\/$/, '');
  const route = slug; // e.g. "roster", "login", "envelopes/sign"

  try {
    if (req.method === 'GET') {
      if (route === '' || route === 'index') return renderInvestorPortal(req, res);
      if (route === 'sign-in') return renderSignInPage(req, res);
      if (route === 'admin') return renderAdminDashboard(req, res);
      if (route === 'admin/envelope') return renderAdminEnvelope(req, res);
      if (route === 'admin/envelopes') return renderAdminEnvelopesList(req, res);
      if (route === 'sign-envelope') return renderSignEnvelope(req, res);
      if (route === 'setup') return getSetupPage(req, res);
      if (route === 'me') return getMe(req, res);
      if (route === 'roster') return getRoster(req, res);
      if (route === 'folder') return getFolder(req, res);
      if (route === 'envelopes') return await getEnvelopes(req, res);
      if (route === 'envelopes/get') return await getEnvelope(req, res);
      if (route === 'envelopes/pdf') return await getEnvelopePdf(req, res);
      if (route === 'my-envelopes') return await getMyEnvelopes(req, res);
      if (route === 'logout') return doLogout(req, res);
      if (route === 'enter-data-room') return enterDataRoom(req, res);
    }
    if (req.method === 'POST') {
      if (route === 'login') return await postLogin(req, res);
      if (route === 'setup') return await postSetup(req, res);
      if (route === 'forgot') return await postForgot(req, res);
      if (route === 'upload') return await postUpload(req, res);
      if (route === 'add-investor') return await postAddInvestor(req, res);
      if (route === 'remove-investor') return await postRemoveInvestor(req, res);
      if (route === 'resend-link') return await postResendLink(req, res);
      if (route === 'envelopes/create') return await postEnvelopeCreate(req, res);
      if (route === 'envelopes/update-fields') return await postEnvelopeUpdate(req, res);
      if (route === 'envelopes/send') return await postEnvelopeSend(req, res);
      if (route === 'envelopes/sign') return await postEnvelopeSign(req, res);
      if (route === 'envelopes/void') return await postEnvelopeVoid(req, res);
      if (route === 'envelopes/resend-invite') return await postEnvelopeResend(req, res);
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
  return res.status(400).json({ ok: false, message: 'Unknown kind.' });
}

// ============================================================================
// Generic envelope signing (any document, N recipients, admin-placed fields)
// ============================================================================

// ---------- Page renderers ----------

function renderAdminEnvelope(req, res) {
  const session = verifyPortalSession(req);
  if (!session) { res.writeHead(302, { Location: '/portal/sign-in' }); return res.end(); }
  if (session.role !== 'admin') { res.writeHead(302, { Location: '/portal' }); return res.end(); }
  return servePublicFile(res, 'portal-admin-envelope.html');
}

function renderAdminEnvelopesList(req, res) {
  const session = verifyPortalSession(req);
  if (!session) { res.writeHead(302, { Location: '/portal/sign-in' }); return res.end(); }
  if (session.role !== 'admin') { res.writeHead(302, { Location: '/portal' }); return res.end(); }
  return servePublicFile(res, 'portal-admin-envelopes.html');
}

function renderSignEnvelope(req, res) {
  // No auth gate here — the page itself authenticates via `?token=...` or via
  // an existing portal session when calling envelopes/get.
  return servePublicFile(res, 'portal-sign-envelope.html');
}

// ---------- Authorization helpers ----------

// Returns { kind: 'admin'|'recipient', envelope, recipient? } or null.
// Caller responds with 401/404 if null.
async function authorizeEnvelopeView(req, envelopeId, providedToken) {
  if (!envelopeId) return null;
  const { drive, fileId, file } = await loadEnvelopes();
  const env = findEnvelope(file, envelopeId);
  if (!env) return null;

  const session = verifyPortalSession(req);

  // Check recipient access first so a user who is BOTH an admin and a recipient
  // on this envelope can actually sign. (Admin-only access falls through below.)
  if (providedToken) {
    const decoded = verifyToken(providedToken);
    if (decoded && decoded.purpose === 'sign-envelope' && typeof decoded.nonce === 'string') {
      const [envId, nonce] = decoded.nonce.split(':');
      if (envId === env.id) {
        const r = (env.recipients || []).find(x => normalizeEmail(x.email) === normalizeEmail(decoded.email) && x.signNonce === nonce);
        if (r) return { kind: 'recipient', env, file, fileId, drive, session, recipient: r };
      }
    }
  }

  if (session) {
    const r = (env.recipients || []).find(x => normalizeEmail(x.email) === normalizeEmail(session.email));
    if (r) return { kind: 'recipient', env, file, fileId, drive, session, recipient: r };
  }

  if (session && session.role === 'admin') {
    return { kind: 'admin', env, file, fileId, drive, session };
  }

  return null;
}

// ---------- Envelope endpoints ----------

async function getEnvelopes(req, res) {
  const session = verifyPortalSession(req);
  if (!session || session.role !== 'admin') return res.status(401).json({ ok: false, message: 'Unauthorized' });
  try {
    const { file } = await loadEnvelopes();
    const envelopes = (file.envelopes || []).map(summarizeEnvelopeForAdmin);
    envelopes.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return res.status(200).json({ ok: true, envelopes });
  } catch (err) {
    console.error('envelopes: list failed', err);
    return res.status(500).json({ ok: false, message: 'Could not load envelopes.' });
  }
}

function summarizeEnvelopeForAdmin(env) {
  return {
    id: env.id,
    title: env.title,
    status: env.status,
    createdBy: env.createdBy,
    createdAt: env.createdAt,
    sentAt: env.sentAt,
    executedAt: env.executedAt,
    enforceOrder: !!env.enforceOrder,
    sourcePdfName: env.sourcePdfName,
    recipientCount: (env.recipients || []).length,
    recipients: (env.recipients || []).map(r => ({
      id: r.id, email: r.email, name: r.name, role: r.role || null,
      order: r.order, signedAt: r.signedAt, invitedAt: r.invitedAt
    })),
    fieldCount: (env.fields || []).length
  };
}

async function getEnvelope(req, res) {
  const u = new URL(req.url, 'http://x');
  const id = u.searchParams.get('id');
  const token = u.searchParams.get('token') || '';
  let auth;
  try { auth = await authorizeEnvelopeView(req, id, token); }
  catch (err) {
    console.error('envelopes/get: auth failed', err);
    return res.status(500).json({ ok: false, message: 'Server error.' });
  }
  if (!auth) return res.status(404).json({ ok: false, message: 'Envelope not found or access denied.' });

  const env = auth.env;
  if (auth.kind === 'admin') {
    return res.status(200).json({
      ok: true,
      viewer: 'admin',
      envelope: serializeEnvelopeFull(env)
    });
  }

  // Recipient view — full envelope shape but with viewerRecipientId so the UI
  // can decide which fields are editable. Sensitive nonces are stripped.
  return res.status(200).json({
    ok: true,
    viewer: 'recipient',
    viewerRecipientId: auth.recipient.id,
    envelope: serializeEnvelopeForRecipient(env)
  });
}

function serializeEnvelopeFull(env) {
  return {
    id: env.id,
    title: env.title,
    status: env.status,
    createdBy: env.createdBy,
    createdAt: env.createdAt,
    sentAt: env.sentAt,
    executedAt: env.executedAt,
    enforceOrder: !!env.enforceOrder,
    ccAdmin: env.ccAdmin !== false,
    sourcePdfId: env.sourcePdfId,
    sourcePdfName: env.sourcePdfName,
    sourcePdfSha256: env.sourcePdfSha256,
    executedPdfId: env.executedPdfId,
    destinationFolderId: env.destinationFolderId,
    recipients: env.recipients || [],
    fields: env.fields || []
  };
}

function serializeEnvelopeForRecipient(env) {
  return {
    id: env.id,
    title: env.title,
    status: env.status,
    enforceOrder: !!env.enforceOrder,
    sourcePdfName: env.sourcePdfName,
    executedPdfId: env.executedPdfId,
    recipients: (env.recipients || []).map(r => ({
      id: r.id, name: r.name, email: r.email, role: r.role || null,
      order: r.order, signedAt: r.signedAt
    })),
    fields: env.fields || []
  };
}

async function getEnvelopePdf(req, res) {
  const u = new URL(req.url, 'http://x');
  const id = u.searchParams.get('id');
  const token = u.searchParams.get('token') || '';
  let auth;
  try { auth = await authorizeEnvelopeView(req, id, token); }
  catch (err) {
    console.error('envelopes/pdf: auth failed', err);
    return res.status(500).json({ ok: false, message: 'Server error.' });
  }
  if (!auth) return res.status(404).json({ ok: false, message: 'Not found' });

  const env = auth.env;
  // Always serve the source PDF in the designer/signer. Executed copy is shown
  // post-completion via Drive directly.
  const pdfId = env.status === 'executed' && env.executedPdfId ? env.executedPdfId : env.sourcePdfId;
  if (!pdfId) return res.status(404).json({ ok: false, message: 'No PDF on file' });

  try {
    const bytes = await downloadFile(auth.drive, pdfId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).send(Buffer.from(bytes));
  } catch (err) {
    console.error('envelopes/pdf: download failed', err);
    return res.status(500).json({ ok: false, message: 'Could not load PDF.' });
  }
}

async function getMyEnvelopes(req, res) {
  const session = verifyPortalSession(req);
  if (!session || session.role !== 'investor') return res.status(401).json({ ok: false, message: 'Unauthorized' });
  try {
    const { file } = await loadEnvelopes();
    const email = normalizeEmail(session.email);
    const out = [];
    for (const env of file.envelopes || []) {
      if (env.status === 'voided') continue;
      const recipient = (env.recipients || []).find(r => normalizeEmail(r.email) === email);
      if (!recipient) continue;
      out.push({
        id: env.id,
        title: env.title,
        status: env.status,
        sentAt: env.sentAt,
        executedAt: env.executedAt,
        recipientSignedAt: recipient.signedAt,
        // Hide from the "to sign" UI if it's not their turn under enforceOrder.
        canSign: canRecipientSignNow(env, recipient)
      });
    }
    out.sort((a, b) => (b.sentAt || '').localeCompare(a.sentAt || ''));
    return res.status(200).json({ ok: true, envelopes: out });
  } catch (err) {
    console.error('my-envelopes: failed', err);
    return res.status(500).json({ ok: false, message: 'Could not load.' });
  }
}

function canRecipientSignNow(env, recipient) {
  if (env.status !== 'sent' && env.status !== 'partially-signed') return false;
  if (recipient.signedAt) return false;
  if (!env.enforceOrder) return true;
  // Their turn iff every recipient with a strictly lower order has signed.
  return (env.recipients || []).every(r => r.id === recipient.id || (r.order || 0) >= (recipient.order || 0) || !!r.signedAt);
}

async function postEnvelopeCreate(req, res) {
  const session = verifyPortalSession(req);
  if (!session || session.role !== 'admin') return res.status(401).json({ ok: false, message: 'Unauthorized' });

  let fields, files;
  try { ({ fields, files } = await readMultipart(req)); }
  catch (err) {
    console.error('envelope/create: parse failed', err);
    return res.status(400).json({ ok: false, message: 'Could not parse form.' });
  }
  const title = String(firstVal(fields.title) || '').trim() || 'Untitled envelope';
  const enforceOrder = String(firstVal(fields.enforceOrder) || '') === 'true';
  // ccAdmin defaults to true if not supplied — admins almost always want a copy.
  const ccAdminRaw = firstVal(fields.ccAdmin);
  const ccAdmin = ccAdminRaw == null ? true : String(ccAdminRaw) !== 'false';
  let recipients = [];
  try {
    const raw = JSON.parse(String(firstVal(fields.recipients) || '[]'));
    if (Array.isArray(raw)) recipients = raw;
  } catch {}

  const pdfFile = Array.isArray(files.pdf) ? files.pdf[0] : files.pdf;
  if (!pdfFile) return res.status(400).json({ ok: false, message: 'PDF is required.' });

  const cleanRecipients = sanitizeRecipients(recipients);
  if (cleanRecipients.errors.length) return res.status(400).json({ ok: false, message: cleanRecipients.errors.join(' ') });

  let envFile, fileId, drive;
  try { ({ file: envFile, fileId, drive } = await loadEnvelopes()); }
  catch (err) {
    console.error('envelope/create: registry load failed', err);
    return res.status(500).json({ ok: false, message: 'Server not configured.' });
  }

  const pdfBytes = fs.readFileSync(pdfFile.filepath);
  const sha = sha256Hex(pdfBytes);

  // Upload PDF to the destination folder. Prefer first known-investor folder.
  let destFolderId = null;
  try {
    const { registry } = await loadRegistry();
    for (const r of cleanRecipients.list) {
      const inv = findByEmail(registry, r.email);
      if (inv && inv.role === 'investor' && inv.folderId) { destFolderId = inv.folderId; break; }
    }
  } catch (err) { console.warn('envelope/create: investor lookup failed', err); }
  if (!destFolderId) {
    try { destFolderId = await getOrCreateEnvelopesFolder(drive, envFile); }
    catch (err) {
      console.error('envelope/create: envelopes folder create failed', err);
      return res.status(500).json({ ok: false, message: 'Could not prepare Drive folder.' });
    }
  }

  let uploaded;
  try {
    const safeName = title.replace(/[^A-Za-z0-9._\- ]+/g, '').slice(0, 60) || 'envelope';
    uploaded = await uploadFile(drive, destFolderId, `${safeName}-source.pdf`, 'application/pdf', pdfBytes);
  } catch (err) {
    console.error('envelope/create: pdf upload failed', err);
    return res.status(500).json({ ok: false, message: 'Could not save PDF to Drive.' });
  }

  const env = {
    id: crypto.randomUUID(),
    title,
    status: 'draft',
    createdBy: session.email,
    createdAt: new Date().toISOString(),
    sentAt: null,
    executedAt: null,
    sourcePdfId: uploaded.id,
    sourcePdfName: pdfFile.originalFilename || `${title}.pdf`,
    sourcePdfSha256: sha,
    executedPdfId: null,
    destinationFolderId: destFolderId,
    enforceOrder,
    ccAdmin,
    recipients: cleanRecipients.list,
    fields: []
  };

  envFile.envelopes = envFile.envelopes || [];
  envFile.envelopes.push(env);
  try { await saveEnvelopes(drive, fileId, envFile); }
  catch (err) {
    console.error('envelope/create: save failed', err);
    return res.status(500).json({ ok: false, message: 'Could not save envelope.' });
  }

  return res.status(200).json({ ok: true, id: env.id });
}

function sanitizeRecipients(rawList) {
  const errors = [];
  const out = [];
  const seenEmails = new Set();
  rawList.forEach((r, idx) => {
    const email = normalizeEmail(r?.email);
    const name = String(r?.name || '').trim();
    const role = r?.role ? String(r.role).slice(0, 80) : '';
    const order = Number.isFinite(Number(r?.order)) ? Math.max(1, Math.floor(Number(r.order))) : idx + 1;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errors.push(`Recipient ${idx + 1}: valid email required.`); return; }
    if (!name) { errors.push(`Recipient ${idx + 1}: name required.`); return; }
    if (seenEmails.has(email)) { errors.push(`Duplicate recipient: ${email}.`); return; }
    seenEmails.add(email);
    out.push({
      id: crypto.randomUUID(),
      email, name, role, order,
      signNonce: crypto.randomBytes(8).toString('hex'),
      invitedAt: null, signedAt: null,
      signedIp: null, signedUserAgent: null
    });
  });
  if (out.length === 0 && errors.length === 0) errors.push('At least one recipient is required.');
  return { list: out, errors };
}

async function postEnvelopeUpdate(req, res) {
  const session = verifyPortalSession(req);
  if (!session || session.role !== 'admin') return res.status(401).json({ ok: false, message: 'Unauthorized' });
  const body = await readJsonBody(req);
  const id = String(body?.id || '');

  let envFile, fileId, drive;
  try { ({ file: envFile, fileId, drive } = await loadEnvelopes()); }
  catch (err) { return res.status(500).json({ ok: false, message: 'Server not configured.' }); }
  const env = findEnvelope(envFile, id);
  if (!env) return res.status(404).json({ ok: false, message: 'Envelope not found.' });
  if (env.status !== 'draft') return res.status(400).json({ ok: false, message: 'Only drafts can be edited.' });

  if (typeof body.title === 'string' && body.title.trim()) env.title = body.title.trim().slice(0, 200);
  if (typeof body.enforceOrder === 'boolean') env.enforceOrder = body.enforceOrder;
  if (typeof body.ccAdmin === 'boolean') env.ccAdmin = body.ccAdmin;

  if (Array.isArray(body.recipients)) {
    // Update recipients in-place: preserve ids/nonces for ones with same email,
    // generate new ones for added rows, drop removed.
    const byEmail = new Map((env.recipients || []).map(r => [normalizeEmail(r.email), r]));
    const seen = new Set();
    const errors = [];
    const next = [];
    body.recipients.forEach((r, idx) => {
      const email = normalizeEmail(r?.email);
      const name = String(r?.name || '').trim();
      const role = r?.role ? String(r.role).slice(0, 80) : '';
      const order = Number.isFinite(Number(r?.order)) ? Math.max(1, Math.floor(Number(r.order))) : idx + 1;
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errors.push(`Recipient ${idx + 1}: valid email required.`); return; }
      if (!name) { errors.push(`Recipient ${idx + 1}: name required.`); return; }
      if (seen.has(email)) { errors.push(`Duplicate recipient: ${email}.`); return; }
      seen.add(email);
      const existing = byEmail.get(email);
      next.push(existing ? { ...existing, name, role, order, email } : {
        id: crypto.randomUUID(),
        email, name, role, order,
        signNonce: crypto.randomBytes(8).toString('hex'),
        invitedAt: null, signedAt: null,
        signedIp: null, signedUserAgent: null
      });
    });
    if (errors.length) return res.status(400).json({ ok: false, message: errors.join(' ') });
    env.recipients = next;
  }

  if (Array.isArray(body.fields)) {
    const validRecipientIds = new Set((env.recipients || []).map(r => r.id));
    const validTypes = new Set(['signature', 'initials', 'date', 'text']);
    const cleaned = [];
    for (const f of body.fields) {
      if (!f || !validTypes.has(f.type)) continue;
      const recipientId = String(f.recipientId || '');
      if (!validRecipientIds.has(recipientId)) continue;
      const page = parseInt(f.page, 10);
      const x = Number(f.x), y = Number(f.y), w = Number(f.width), h = Number(f.height);
      if (![page, x, y, w, h].every(Number.isFinite)) continue;
      if (page < 1 || w <= 0 || h <= 0) continue;
      cleaned.push({
        id: String(f.id || '').match(/^[\w-]{8,}$/) ? f.id : crypto.randomUUID(),
        recipientId,
        type: f.type,
        page,
        x: round2(x), y: round2(y), width: round2(w), height: round2(h),
        required: f.required !== false,
        status: 'confirmed',
        defaultValue: f.defaultValue || null,
        filledValue: null,
        filledAt: null
      });
    }
    env.fields = cleaned;
  }

  try { await saveEnvelopes(drive, fileId, envFile); }
  catch (err) {
    console.error('envelope/update: save failed', err);
    return res.status(500).json({ ok: false, message: 'Could not save envelope.' });
  }
  return res.status(200).json({ ok: true });
}

function round2(n) { return Math.round(n * 100) / 100; }

async function postEnvelopeSend(req, res) {
  const session = verifyPortalSession(req);
  if (!session || session.role !== 'admin') return res.status(401).json({ ok: false, message: 'Unauthorized' });
  const body = await readJsonBody(req);
  const id = String(body?.id || '');

  let envFile, fileId, drive;
  try { ({ file: envFile, fileId, drive } = await loadEnvelopes()); }
  catch (err) { return res.status(500).json({ ok: false, message: 'Server not configured.' }); }
  const env = findEnvelope(envFile, id);
  if (!env) return res.status(404).json({ ok: false, message: 'Envelope not found.' });
  if (env.status !== 'draft') return res.status(400).json({ ok: false, message: 'Envelope is not a draft.' });
  if (!(env.recipients || []).length) return res.status(400).json({ ok: false, message: 'Add at least one recipient before sending.' });
  if (!(env.fields || []).length) return res.status(400).json({ ok: false, message: 'Place at least one field before sending.' });

  // Every recipient must have at least one field assigned.
  const fieldsByRecipient = new Set((env.fields || []).map(f => f.recipientId));
  for (const r of env.recipients) {
    if (!fieldsByRecipient.has(r.id)) {
      return res.status(400).json({ ok: false, message: `Recipient "${r.name}" has no fields assigned.` });
    }
  }

  env.status = 'sent';
  env.sentAt = new Date().toISOString();

  // Decide who to invite immediately. If enforceOrder, only the lowest order.
  const senderName = await lookupAdminName(session.email);
  const recipientsToInvite = env.enforceOrder
    ? [pickLowestOrderRecipient(env)]
    : (env.recipients || []);

  try { await saveEnvelopes(drive, fileId, envFile); }
  catch (err) {
    console.error('envelope/send: save failed', err);
    return res.status(500).json({ ok: false, message: 'Could not update envelope.' });
  }

  // Await invites so we can surface email failures to the admin. The envelope
  // is already 'sent' at this point; we report which recipients didn't receive
  // an email so the admin can resend manually.
  const inviteResults = [];
  for (const r of recipientsToInvite) {
    if (!r) continue;
    let result;
    try { result = await inviteRecipient(env, r, senderName); }
    catch (err) { result = { sent: false, reason: err.message }; }
    if (result?.sent) r.invitedAt = env.sentAt;
    inviteResults.push({ email: r.email, name: r.name, sent: !!result?.sent, reason: result?.reason || null });
    if (!result?.sent) console.warn('envelope/send: invite failed for', r.email, result?.reason);
  }
  try { await saveEnvelopes(drive, fileId, envFile); } catch {}

  const failed = inviteResults.filter(x => !x.sent);
  if (failed.length === inviteResults.length && inviteResults.length > 0) {
    return res.status(200).json({
      ok: false,
      message: `Envelope was marked sent but no invitation emails went out. ${failed[0].reason || 'Email service error.'}`
    });
  }
  if (failed.length > 0) {
    return res.status(200).json({
      ok: true,
      warning: `Some invitations failed: ${failed.map(f => f.email).join(', ')}. Use "Resend invite" from the envelopes list.`
    });
  }
  return res.status(200).json({ ok: true });
}

function pickLowestOrderRecipient(env) {
  const pending = (env.recipients || []).filter(r => !r.signedAt);
  if (!pending.length) return null;
  pending.sort((a, b) => (a.order || 0) - (b.order || 0));
  return pending[0];
}

async function lookupAdminName(adminEmail) {
  try {
    const { registry } = await loadRegistry();
    const entry = findByEmail(registry, adminEmail);
    return entry?.name || 'Avenue admin';
  } catch { return 'Avenue admin'; }
}

async function inviteRecipient(env, recipient, senderName) {
  const token = issueToken({
    email: recipient.email,
    purpose: 'sign-envelope',
    nonce: `${env.id}:${recipient.signNonce}`
  });
  // BCC the admin (Kevin) on every invite if the envelope opts in. Skip the
  // BCC if the recipient IS Kevin to avoid sending the same person two copies.
  const bcc = env.ccAdmin !== false && normalizeEmail(recipient.email) !== normalizeEmail(KEVIN_EMAIL)
    ? KEVIN_EMAIL
    : undefined;
  return sendEnvelopeInvite({
    to: recipient.email,
    recipientName: recipient.name,
    envelopeTitle: env.title,
    senderName,
    token,
    envelopeId: env.id,
    bcc
  });
}

async function postEnvelopeSign(req, res) {
  const body = await readJsonBody(req);
  const id = String(body?.id || '');
  const token = String(body?.token || '');
  const submitted = Array.isArray(body?.fields) ? body.fields : [];

  let auth;
  try { auth = await authorizeEnvelopeView(req, id, token); }
  catch (err) {
    console.error('envelope/sign: auth failed', err);
    return res.status(500).json({ ok: false, message: 'Server error.' });
  }
  if (!auth || auth.kind !== 'recipient') return res.status(401).json({ ok: false, message: 'Unauthorized.' });

  const env = auth.env;
  const recipient = auth.recipient;
  if (env.status === 'voided') return res.status(410).json({ ok: false, message: 'This envelope has been voided.' });
  if (env.status === 'executed') return res.status(409).json({ ok: false, message: 'This envelope is already fully executed.' });
  if (recipient.signedAt) return res.status(409).json({ ok: false, message: 'You have already signed this envelope.' });
  if (env.enforceOrder && !canRecipientSignNow(env, recipient)) {
    return res.status(409).json({ ok: false, message: 'It is not yet your turn to sign.' });
  }

  // Index submissions for fast lookup.
  const submittedById = new Map();
  for (const s of submitted) {
    if (s && typeof s.id === 'string') submittedById.set(s.id, String(s.value == null ? '' : s.value));
  }

  const now = new Date().toISOString();
  const myFields = (env.fields || []).filter(f => f.recipientId === recipient.id);
  for (const f of myFields) {
    if (f.filledValue) continue; // already filled in a previous interrupted attempt; skip
    if (f.type === 'date') {
      f.filledValue = todayLong(now);
      f.filledAt = now;
      continue;
    }
    const v = (submittedById.get(f.id) || '').trim();
    if (!v) {
      if (f.required !== false) {
        const label = f.type === 'signature' ? 'signature' : f.type === 'initials' ? 'initials' : f.type === 'text' ? 'text field' : f.type;
        return res.status(400).json({ ok: false, message: `Please fill in the required ${label} on page ${f.page} before signing.` });
      }
      continue;
    }
    f.filledValue = v.slice(0, 200);
    f.filledAt = now;
  }

  recipient.signedAt = now;
  recipient.signedIp = (req.headers['x-forwarded-for'] || '').toString().split(',')[0] || null;
  recipient.signedUserAgent = (req.headers['user-agent'] || '').toString().slice(0, 240);

  // Rotate single-use nonce so the magic link can't be reused.
  recipient.signNonce = crypto.randomBytes(8).toString('hex');

  // Has everyone signed?
  const allSigned = (env.recipients || []).every(r => !!r.signedAt);
  if (!allSigned) {
    env.status = 'partially-signed';
    try { await saveEnvelopes(auth.drive, auth.fileId, auth.file); }
    catch (err) {
      console.error('envelope/sign: save failed', err);
      return res.status(500).json({ ok: false, message: 'Could not save signature.' });
    }
    // Notify next recipient if enforceOrder.
    if (env.enforceOrder) {
      const next = pickLowestOrderRecipient(env);
      if (next) {
        const senderName = await lookupAdminName(env.createdBy);
        inviteRecipient(env, next, senderName)
          .then(() => { next.invitedAt = now; })
          .catch(err => console.warn('envelope/sign: next invite failed', err));
        try { await saveEnvelopes(auth.drive, auth.fileId, auth.file); } catch {}
      }
    }
    return res.status(200).json({ ok: true, allSigned: false });
  }

  // Everyone signed — flatten and upload.
  let signedBytes;
  try {
    const source = await downloadFile(auth.drive, env.sourcePdfId);
    signedBytes = await flattenEnvelope(source, env.fields || []);
  } catch (err) {
    console.error('envelope/sign: flatten failed', err);
    return res.status(500).json({ ok: false, message: 'Could not produce executed PDF.' });
  }
  let uploaded;
  try {
    const safe = (env.title || 'envelope').replace(/[^A-Za-z0-9._\- ]+/g, '').slice(0, 60);
    uploaded = await uploadFile(auth.drive, env.destinationFolderId, `${safe}-executed.pdf`, 'application/pdf', signedBytes);
  } catch (err) {
    console.error('envelope/sign: upload failed', err);
    return res.status(500).json({ ok: false, message: 'Could not save executed PDF.' });
  }
  env.executedPdfId = uploaded.id;
  env.executedAt = now;
  env.status = 'executed';
  try { await saveEnvelopes(auth.drive, auth.fileId, auth.file); }
  catch (err) {
    console.error('envelope/sign: final save failed', err);
    return res.status(500).json({ ok: false, message: 'Could not finalize envelope.' });
  }

  // Email executed copy to every recipient with Kevin BCC.
  const KEVIN_EMAIL = 'Kevin@AKCapital.fund';
  const allEmails = Array.from(new Set((env.recipients || []).map(r => r.email).filter(Boolean)));
  sendEnvelopeExecutedCopy({
    to: allEmails,
    envelopeTitle: env.title,
    pdfBytes: signedBytes,
    pdfFilename: `${(env.title || 'envelope').replace(/[^A-Za-z0-9._\- ]+/g, '').slice(0, 60) || 'envelope'}-executed.pdf`,
    bcc: KEVIN_EMAIL
  }).catch(err => console.warn('envelope/sign: executed email failed', err));

  return res.status(200).json({ ok: true, allSigned: true });
}

async function postEnvelopeVoid(req, res) {
  const session = verifyPortalSession(req);
  if (!session || session.role !== 'admin') return res.status(401).json({ ok: false, message: 'Unauthorized' });
  const body = await readJsonBody(req);
  const id = String(body?.id || '');
  let envFile, fileId, drive;
  try { ({ file: envFile, fileId, drive } = await loadEnvelopes()); }
  catch { return res.status(500).json({ ok: false, message: 'Server not configured.' }); }
  const env = findEnvelope(envFile, id);
  if (!env) return res.status(404).json({ ok: false, message: 'Envelope not found.' });
  if (env.status === 'executed') return res.status(400).json({ ok: false, message: 'Cannot void an executed envelope.' });
  env.status = 'voided';
  try { await saveEnvelopes(drive, fileId, envFile); }
  catch (err) {
    console.error('envelope/void: save failed', err);
    return res.status(500).json({ ok: false, message: 'Could not save.' });
  }
  return res.status(200).json({ ok: true });
}

async function postEnvelopeResend(req, res) {
  const session = verifyPortalSession(req);
  if (!session || session.role !== 'admin') return res.status(401).json({ ok: false, message: 'Unauthorized' });
  const body = await readJsonBody(req);
  const id = String(body?.id || '');
  const recipientId = String(body?.recipientId || '');
  let envFile, fileId, drive;
  try { ({ file: envFile, fileId, drive } = await loadEnvelopes()); }
  catch { return res.status(500).json({ ok: false, message: 'Server not configured.' }); }
  const env = findEnvelope(envFile, id);
  if (!env) return res.status(404).json({ ok: false, message: 'Envelope not found.' });
  if (env.status !== 'sent' && env.status !== 'partially-signed') {
    return res.status(400).json({ ok: false, message: 'Envelope is not in a sendable state.' });
  }
  const recipient = findRecipient(env, recipientId);
  if (!recipient) return res.status(404).json({ ok: false, message: 'Recipient not found.' });
  if (recipient.signedAt) return res.status(400).json({ ok: false, message: 'Recipient has already signed.' });

  // Rotate nonce so the previous link stops working.
  recipient.signNonce = crypto.randomBytes(8).toString('hex');
  recipient.invitedAt = new Date().toISOString();
  try { await saveEnvelopes(drive, fileId, envFile); } catch (err) { console.warn('envelope/resend: save failed', err); }

  const senderName = await lookupAdminName(env.createdBy);
  const result = await inviteRecipient(env, recipient, senderName);
  if (!result.sent) return res.status(500).json({ ok: false, message: 'Email failed: ' + (result.reason || 'unknown') });
  return res.status(200).json({ ok: true });
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
