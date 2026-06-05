// Authoritative registry of investors + admins for the Investor Portal.
// Stored as `investor-registry.json` inside the GOOGLE_DRIVE_PORTAL_ROOT_FOLDER_ID
// Drive folder, alongside per-investor subfolders.
//
// Shape:
// {
//   "entries": [
//     { role:"admin", name, email, passwordHash, passwordCreatedAt, resetNonce? },
//     { role:"investor", name, email, principal, rate, termMonths, folderId,
//       blankPdfId, passwordHash, passwordCreatedAt, resetNonce?,
//       lukasSignedAt, lukasSignedPdfId, signedAt, signedPdfId, deletedAt? }
//   ],
//   "updatedAt": "ISO"
// }
//
// On first read, if the file doesn't exist, an empty registry is bootstrapped and
// written back. Initial admin entries (Kevin + Lukas) are seeded automatically.
import { google } from 'googleapis';
import { Readable } from 'stream';

const REGISTRY_FILENAME = 'investor-registry.json';

// Seeded automatically when bootstrapping the registry for the first time.
const SEED_ADMINS = [
  { role: 'admin', name: 'Kevin Simpson', email: 'kevin@akcapital.fund' },
  { role: 'admin', name: 'Lukas Bondy', email: 'bondysconstruction@gmail.com' }
];

export function getDrive() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive']
  });
  return google.drive({ version: 'v3', auth });
}

function rootFolderId() {
  const id = process.env.GOOGLE_DRIVE_PORTAL_ROOT_FOLDER_ID;
  if (!id) throw new Error('GOOGLE_DRIVE_PORTAL_ROOT_FOLDER_ID not configured');
  return id;
}

async function findRegistryFile(drive) {
  const folderId = rootFolderId();
  const list = await drive.files.list({
    q: `'${folderId}' in parents and name = '${REGISTRY_FILENAME}' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 5,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  });
  return (list.data.files || [])[0] || null;
}

async function readRegistryFile(drive, fileId) {
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'text' }
  );
  try {
    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    if (!data || !Array.isArray(data.entries)) return { entries: [], updatedAt: null };
    return data;
  } catch {
    return { entries: [], updatedAt: null };
  }
}

async function writeRegistryFile(drive, fileId, registry) {
  registry.updatedAt = new Date().toISOString();
  const body = JSON.stringify(registry, null, 2);
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
      name: REGISTRY_FILENAME,
      parents: [rootFolderId()],
      mimeType: 'application/json',
      description: 'Authoritative investor + admin registry. Auto-maintained.'
    },
    media: { mimeType: 'application/json', body: Readable.from(Buffer.from(body)) },
    fields: 'id',
    supportsAllDrives: true
  });
  return created.data.id;
}

// Load the registry. If absent, seed with admin entries and persist.
// Returns { drive, fileId, registry }.
export async function loadRegistry() {
  const drive = getDrive();
  let file = await findRegistryFile(drive);
  if (file) {
    const registry = await readRegistryFile(drive, file.id);
    return { drive, fileId: file.id, registry };
  }
  const seeded = {
    entries: SEED_ADMINS.map(a => ({
      ...a,
      passwordHash: null,
      passwordCreatedAt: null,
      resetNonce: null
    })),
    updatedAt: new Date().toISOString()
  };
  const fileId = await writeRegistryFile(drive, null, seeded);
  return { drive, fileId, registry: seeded };
}

export async function saveRegistry(drive, fileId, registry) {
  return writeRegistryFile(drive, fileId, registry);
}

// Normalize an email for matching: trim + lowercase.
export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

// Find a registry entry by email (case-insensitive).
// Skips soft-deleted entries unless includeDeleted=true.
export function findByEmail(registry, email, { includeDeleted = false } = {}) {
  const target = normalizeEmail(email);
  if (!target) return null;
  return (
    registry.entries.find(e => {
      if (!includeDeleted && e.deletedAt) return false;
      return normalizeEmail(e.email) === target;
    }) || null
  );
}

// Replace (in-place) the matching entry. Returns the mutated entry.
// Prefers the ACTIVE (non-deleted) entry so that when a duplicate exists (e.g. an
// investor who was removed and re-added shares an email with a removed record),
// writes like password/resetNonce land on the live account — not the dead twin.
export function updateEntry(registry, email, patch) {
  const target = normalizeEmail(email);
  let idx = registry.entries.findIndex(e => !e.deletedAt && normalizeEmail(e.email) === target);
  if (idx === -1) idx = registry.entries.findIndex(e => normalizeEmail(e.email) === target);
  if (idx === -1) return null;
  registry.entries[idx] = { ...registry.entries[idx], ...patch };
  return registry.entries[idx];
}

// Create a Drive subfolder for a new investor under the portal root.
export async function createInvestorFolder(drive, name) {
  const safe = String(name || 'investor').replace(/[^A-Za-z0-9 _.-]+/g, '').trim().slice(0, 80) || 'investor';
  const res = await drive.files.create({
    requestBody: {
      name: safe,
      parents: [rootFolderId()],
      mimeType: 'application/vnd.google-apps.folder'
    },
    fields: 'id, name',
    supportsAllDrives: true
  });
  return { id: res.data.id, name: res.data.name };
}

// Upload arbitrary bytes (Buffer or Uint8Array) into the given Drive folder.
// Returns { id, name }.
export async function uploadFile(drive, folderId, filename, mimeType, bytes) {
  const created = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [folderId]
    },
    media: {
      mimeType,
      body: Readable.from(Buffer.from(bytes))
    },
    fields: 'id, name',
    supportsAllDrives: true
  });
  return { id: created.data.id, name: created.data.name };
}

// Download a Drive file as a Buffer.
export async function downloadFile(drive, fileId) {
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(res.data);
}

// List files inside a Drive folder. Returns [{ id, name, mimeType, createdTime, webViewLink }].
export async function listFolderFiles(drive, folderId) {
  const out = [];
  let pageToken;
  do {
    const list = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, createdTime, webViewLink)',
      pageSize: 100,
      pageToken,
      orderBy: 'createdTime desc',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });
    for (const f of list.data.files || []) out.push(f);
    pageToken = list.data.nextPageToken;
  } while (pageToken);
  return out;
}
