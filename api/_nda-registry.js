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

async function downloadFileBuffer(drive, fileId) {
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(res.data);
}

async function extractEmailFromPdf(drive, fileId) {
  try {
    // Lazy-load pdf-parse so the registry module stays cheap when unused
    const { default: pdfParse } = await import('pdf-parse');
    const buf = await downloadFileBuffer(drive, fileId);
    const parsed = await pdfParse(buf);
    const text = parsed.text || '';
    const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (!emailMatch) return null;
    // Best-effort name extraction: NDAs typically include "Name: <Full Name>" or list
    // the typed signature. Try a few patterns; fall back to empty.
    let name = '';
    const nm =
      text.match(/Name:\s*([^\n\r]+)/i) ||
      text.match(/Receiving Party:\s*([^\n\r]+)/i) ||
      text.match(/Signature:\s*([^\n\r]+)/i);
    if (nm) name = nm[1].trim().slice(0, 120);
    return { email: emailMatch[0].toLowerCase(), name };
  } catch (err) {
    console.warn('pdf text extract failed for', fileId, err.message);
    return null;
  }
}

export async function bootstrapFromFolder(drive, folderId, { scrapePdfs = true } = {}) {
  const entries = [];
  const seen = new Set();
  const files = [];
  let pageToken;
  do {
    const list = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, description, mimeType, createdTime)',
      pageSize: 200,
      pageToken,
      orderBy: 'createdTime',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });
    for (const f of (list.data.files || [])) {
      if (f.name === REGISTRY_FILENAME) continue;
      files.push(f);
    }
    pageToken = list.data.nextPageToken;
  } while (pageToken);

  for (const f of files) {
    let email = '';
    let name = '';
    let signedAt = f.createdTime || '';

    const desc = f.description || '';
    const dm = desc.match(/Signed by\s+(.+?)\s+<([^>]+)>\s+on\s+(\S+)/i);
    if (dm) {
      name = dm[1].trim();
      email = dm[2].trim().toLowerCase();
      signedAt = dm[3];
    } else if (scrapePdfs && (f.mimeType === 'application/pdf' || /\.pdf$/i.test(f.name))) {
      const scraped = await extractEmailFromPdf(drive, f.id);
      if (scraped) {
        email = scraped.email;
        name = scraped.name;
      }
    }

    if (!email || seen.has(email)) continue;
    seen.add(email);
    entries.push({ email, name, signedAt, reference: '' });
  }

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

export { findRegistryFile, writeRegistryFile, getDrive };

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
