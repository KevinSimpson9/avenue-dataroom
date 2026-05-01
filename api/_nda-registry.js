// Authoritative registry of emails authorized for the data room.
// Stored as nda-registry.json inside the Avenue NDAs Drive folder so it
// survives serverless redeploys and stays in the same place as the PDFs.
//
// Shape: { entries: [{ email, name, signedAt, reference }], updatedAt }
//
// On first read, if the file doesn't exist, it bootstraps from existing
// PDF descriptions in the folder ("Signed by <Name> <email>...") and
// writes the registry back so subsequent calls are a single Drive read.
import { google } from 'googleapis';
import { Readable } from 'stream';

const REGISTRY_FILENAME = 'nda-registry.json';

function getDrive() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.file']
  });
  return google.drive({ version: 'v3', auth });
}

async function findRegistryFile(drive, folderId) {
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
    if (!data || !Array.isArray(data.entries)) return { entries: [] };
    return data;
  } catch {
    return { entries: [] };
  }
}

async function bootstrapFromFolder(drive, folderId) {
  const entries = [];
  const seen = new Set();
  let pageToken;
  do {
    const list = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, description, createdTime)',
      pageSize: 200,
      pageToken,
      orderBy: 'createdTime',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });
    for (const f of (list.data.files || [])) {
      if (f.name === REGISTRY_FILENAME) continue;
      const desc = f.description || '';
      const m = desc.match(/Signed by\s+(.+?)\s+<([^>]+)>\s+on\s+(\S+)/i);
      if (!m) continue;
      const email = m[2].trim().toLowerCase();
      if (seen.has(email)) continue;
      seen.add(email);
      entries.push({
        email,
        name: m[1].trim(),
        signedAt: m[3],
        reference: ''
      });
    }
    pageToken = list.data.nextPageToken;
  } while (pageToken);
  return { entries, updatedAt: new Date().toISOString() };
}

async function writeRegistryFile(drive, folderId, existingFileId, registry) {
  const body = JSON.stringify(registry, null, 2);
  if (existingFileId) {
    await drive.files.update({
      fileId: existingFileId,
      media: { mimeType: 'application/json', body: Readable.from(Buffer.from(body)) },
      supportsAllDrives: true
    });
    return existingFileId;
  }
  const created = await drive.files.create({
    requestBody: {
      name: REGISTRY_FILENAME,
      parents: [folderId],
      mimeType: 'application/json',
      description: 'Authoritative registry of emails authorized for the data room. Auto-maintained.'
    },
    media: { mimeType: 'application/json', body: Readable.from(Buffer.from(body)) },
    fields: 'id',
    supportsAllDrives: true
  });
  return created.data.id;
}

// Load the registry, bootstrapping (and persisting) from PDF descriptions if missing.
export async function loadRegistry() {
  const folderId = process.env.GOOGLE_DRIVE_NDA_FOLDER_ID;
  if (!folderId) throw new Error('GOOGLE_DRIVE_NDA_FOLDER_ID not configured');
  const drive = getDrive();
  const file = await findRegistryFile(drive, folderId);
  if (file) {
    const registry = await readRegistryFile(drive, file.id);
    return { drive, folderId, fileId: file.id, registry };
  }
  const registry = await bootstrapFromFolder(drive, folderId);
  const fileId = await writeRegistryFile(drive, folderId, null, registry);
  return { drive, folderId, fileId, registry };
}

export function hasEmail(registry, email) {
  const target = String(email || '').trim().toLowerCase();
  if (!target) return null;
  return registry.entries.find(e => (e.email || '').toLowerCase() === target) || null;
}

// Append a new signing entry, deduplicating by email (most recent wins).
export async function appendSigning({ email, name, signedAt, reference }) {
  const { drive, folderId, fileId, registry } = await loadRegistry();
  const target = String(email || '').trim().toLowerCase();
  if (!target) return;
  const filtered = registry.entries.filter(e => (e.email || '').toLowerCase() !== target);
  filtered.push({
    email: target,
    name: name || '',
    signedAt: signedAt || new Date().toISOString(),
    reference: reference || ''
  });
  const next = { entries: filtered, updatedAt: new Date().toISOString() };
  await writeRegistryFile(drive, folderId, fileId, next);
}
