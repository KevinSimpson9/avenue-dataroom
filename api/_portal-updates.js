// Deal updates feed. Stored as `updates.json` inside the portal root Drive folder,
// alongside `investor-registry.json` and `envelopes.json`.
//
// An update is a short post Kevin writes. Audience is either "all" (every investor
// sees it) or a single investor's email (only they see it).
//
// Shape:
// {
//   "updates": [
//     { id, title, body, audience: "all" | "<email>", createdBy, createdAt }
//   ],
//   "updatedAt": "ISO"
// }
import crypto from 'crypto';
import { Readable } from 'stream';
import { getDrive, normalizeEmail } from './_portal-registry.js';

const FILENAME = 'updates.json';

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
    if (!data || !Array.isArray(data.updates)) return { updates: [], updatedAt: null };
    return data;
  } catch {
    return { updates: [], updatedAt: null };
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
      description: 'Investor portal deal updates. Auto-maintained.'
    },
    media: { mimeType: 'application/json', body: Readable.from(Buffer.from(body)) },
    fields: 'id',
    supportsAllDrives: true
  });
  return created.data.id;
}

// Load (or bootstrap) the updates file. Returns { drive, fileId, file }.
export async function loadUpdates() {
  const drive = getDrive();
  const f = await findFile(drive);
  if (f) {
    const file = await readFile(drive, f.id);
    return { drive, fileId: f.id, file };
  }
  const seeded = { updates: [], updatedAt: new Date().toISOString() };
  const fileId = await writeFile(drive, null, seeded);
  return { drive, fileId, file: seeded };
}

export async function saveUpdates(drive, fileId, file) {
  return writeFile(drive, fileId, file);
}

export function addUpdate(file, { title, body, audience, createdBy }) {
  const entry = {
    id: crypto.randomUUID(),
    title: String(title || '').trim().slice(0, 200),
    body: String(body || '').trim().slice(0, 8000),
    audience: audience === 'all' ? 'all' : normalizeEmail(audience),
    createdBy: createdBy || null,
    createdAt: new Date().toISOString()
  };
  file.updates = file.updates || [];
  file.updates.push(entry);
  return entry;
}

export function removeUpdate(file, id) {
  const before = (file.updates || []).length;
  file.updates = (file.updates || []).filter(u => u.id !== id);
  return file.updates.length < before;
}

// Updates visible to a given investor: deal-wide plus ones addressed to them.
// Newest first.
export function updatesForInvestor(file, email) {
  const target = normalizeEmail(email);
  return (file.updates || [])
    .filter(u => u.audience === 'all' || normalizeEmail(u.audience) === target)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

// All updates, newest first (admin view).
export function allUpdates(file) {
  return (file.updates || []).slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}
