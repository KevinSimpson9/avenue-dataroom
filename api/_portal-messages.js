// Two-way messaging between each investor and the admin (Kevin). Stored as
// `messages.json` inside the portal root Drive folder.
//
// One thread per investor, keyed by the investor's email. Each message records who
// sent it and per-role read flags so the admin inbox can show unread badges.
//
// Shape:
// {
//   "threads": [
//     { email, updatedAt, messages: [
//       { id, from: "investor" | "admin", authorEmail, body, createdAt,
//         readByAdmin, readByInvestor }
//     ] }
//   ],
//   "updatedAt": "ISO"
// }
import crypto from 'crypto';
import { Readable } from 'stream';
import { getDrive, normalizeEmail } from './_portal-registry.js';

const FILENAME = 'messages.json';

function rootFolderId() {
  const id = process.env.GOOGLE_DRIVE_PORTAL_ROOT_FOLDER_ID;
  if (!id) throw new Error('GOOGLE_DRIVE_PORTAL_ROOT_FOLDER_ID not configured');
  return id;
}

async function findFile(drive) {
  const list = await drive.files.list({
    q: `'${rootFolderId()}' in parents and name = '${FILENAME}' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 5,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  });
  return (list.data.files || [])[0] || null;
}

async function readFile(drive, fileId) {
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'text' }
  );
  try {
    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    if (!data || !Array.isArray(data.threads)) return { threads: [], updatedAt: null };
    return data;
  } catch {
    return { threads: [], updatedAt: null };
  }
}

async function writeFile(drive, fileId, file) {
  file.updatedAt = new Date().toISOString();
  const body = JSON.stringify(file, null, 2);
  if (fileId) {
    await drive.files.update({
      fileId,
      media: { mimeType: 'application/json', body: Readable.from(Buffer.from(body)) },
      supportsAllDrives: true
    });
    return fileId;
  }
  const created = await drive.files.create({
    requestBody: {
      name: FILENAME,
      parents: [rootFolderId()],
      mimeType: 'application/json',
      description: 'Investor portal messages. Auto-maintained.'
    },
    media: { mimeType: 'application/json', body: Readable.from(Buffer.from(body)) },
    fields: 'id',
    supportsAllDrives: true
  });
  return created.data.id;
}

// Load (or bootstrap) the messages file. Returns { drive, fileId, file }.
export async function loadMessages() {
  const drive = getDrive();
  const f = await findFile(drive);
  if (f) {
    const file = await readFile(drive, f.id);
    return { drive, fileId: f.id, file };
  }
  const seeded = { threads: [], updatedAt: new Date().toISOString() };
  const fileId = await writeFile(drive, null, seeded);
  return { drive, fileId, file: seeded };
}

export async function saveMessages(drive, fileId, file) {
  return writeFile(drive, fileId, file);
}

// Get an investor's thread, creating an empty one if missing.
export function getOrCreateThread(file, email) {
  const target = normalizeEmail(email);
  file.threads = file.threads || [];
  let t = file.threads.find(x => normalizeEmail(x.email) === target);
  if (!t) {
    t = { email: target, messages: [], updatedAt: new Date().toISOString() };
    file.threads.push(t);
  }
  return t;
}

// Read-only lookup (no mutation).
export function getThread(file, email) {
  const target = normalizeEmail(email);
  return (file.threads || []).find(x => normalizeEmail(x.email) === target) || null;
}

export function appendMessage(file, email, { from, authorEmail, body }) {
  const thread = getOrCreateThread(file, email);
  const msg = {
    id: crypto.randomUUID(),
    from: from === 'admin' ? 'admin' : 'investor',
    authorEmail: normalizeEmail(authorEmail),
    body: String(body || '').trim().slice(0, 4000),
    createdAt: new Date().toISOString(),
    // A new message is unread by the *other* party.
    readByAdmin: from === 'admin',
    readByInvestor: from === 'investor'
  };
  thread.messages.push(msg);
  thread.updatedAt = msg.createdAt;
  return msg;
}

// Mark every message in a thread as read by the viewing role.
export function markRead(file, email, viewerRole) {
  const thread = getThread(file, email);
  if (!thread) return false;
  let changed = false;
  for (const m of thread.messages) {
    if (viewerRole === 'admin' && !m.readByAdmin) { m.readByAdmin = true; changed = true; }
    if (viewerRole === 'investor' && !m.readByInvestor) { m.readByInvestor = true; changed = true; }
  }
  return changed;
}

// One summary per thread for the admin inbox (newest activity first).
export function threadSummaries(file) {
  return (file.threads || [])
    .map(t => {
      const msgs = t.messages || [];
      const last = msgs[msgs.length - 1] || null;
      return {
        email: t.email,
        messageCount: msgs.length,
        lastMessageAt: last ? last.createdAt : t.updatedAt,
        lastFrom: last ? last.from : null,
        lastSnippet: last ? last.body.slice(0, 120) : '',
        unreadFromInvestor: msgs.filter(m => m.from === 'investor' && !m.readByAdmin).length
      };
    })
    .filter(s => s.messageCount > 0)
    .sort((a, b) => (b.lastMessageAt || '').localeCompare(a.lastMessageAt || ''));
}
