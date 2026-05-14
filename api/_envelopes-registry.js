// Registry of generic signing envelopes. Stored as `envelopes.json` inside the
// portal root Drive folder, alongside `investor-registry.json`.
//
// An envelope is a self-contained signing job: one source PDF + N recipients +
// M fields, each field assigned to a recipient and positioned anywhere on the
// PDF. Nothing here is coded to a specific document type.
//
// Shape:
// {
//   "envelopes": [
//     {
//       id, title, status, createdBy, createdAt, sentAt, executedAt,
//       sourcePdfId, sourcePdfName, sourcePdfSha256,
//       executedPdfId, destinationFolderId,
//       enforceOrder, ccAdmin,
//       recipients: [{ id, email, name, role, order, signNonce,
//                      invitedAt, signedAt, signedIp, signedUserAgent }],
//       fields: [{ id, recipientId, type, page, x, y, width, height,
//                  required, status, defaultValue, filledValue, filledAt }]
//     }
//   ],
//   "envelopesFolderId": "...",   // cached id of the shared Envelopes/ folder
//   "updatedAt": "ISO"
// }
import { Readable } from 'stream';
import { getDrive } from './_portal-registry.js';

const FILENAME = 'envelopes.json';
const ENVELOPES_FOLDER_NAME = 'Envelopes';

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
    if (!data || !Array.isArray(data.envelopes)) {
      return { envelopes: [], envelopesFolderId: data?.envelopesFolderId || null, updatedAt: null };
    }
    return data;
  } catch {
    return { envelopes: [], envelopesFolderId: null, updatedAt: null };
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
      description: 'Generic signing envelopes for The Avenue portal. Auto-maintained.'
    },
    media: { mimeType: 'application/json', body: Readable.from(Buffer.from(body)) },
    fields: 'id',
    supportsAllDrives: true
  });
  return created.data.id;
}

// Load (or bootstrap) the envelopes file. Returns { drive, fileId, file }.
export async function loadEnvelopes() {
  const drive = getDrive();
  let f = await findFile(drive);
  if (f) {
    const file = await readFile(drive, f.id);
    return { drive, fileId: f.id, file };
  }
  const seeded = { envelopes: [], envelopesFolderId: null, updatedAt: new Date().toISOString() };
  const fileId = await writeFile(drive, null, seeded);
  return { drive, fileId, file: seeded };
}

export async function saveEnvelopes(drive, fileId, file) {
  return writeFile(drive, fileId, file);
}

export function findEnvelope(file, id) {
  if (!id) return null;
  return (file.envelopes || []).find(e => e.id === id) || null;
}

export function findRecipient(env, recipientId) {
  if (!env || !recipientId) return null;
  return (env.recipients || []).find(r => r.id === recipientId) || null;
}

// Lazy-create the shared Envelopes/ folder used as the destination fallback
// when no recipient is a known investor. Cached via envelopesFolderId on the
// envelopes file itself so we don't search Drive every request.
export async function getOrCreateEnvelopesFolder(drive, file) {
  if (file.envelopesFolderId) return file.envelopesFolderId;
  const list = await drive.files.list({
    q: `'${rootFolderId()}' in parents and name = '${ENVELOPES_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 5,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  });
  let folderId = (list.data.files || [])[0]?.id;
  if (!folderId) {
    const created = await drive.files.create({
      requestBody: {
        name: ENVELOPES_FOLDER_NAME,
        parents: [rootFolderId()],
        mimeType: 'application/vnd.google-apps.folder'
      },
      fields: 'id',
      supportsAllDrives: true
    });
    folderId = created.data.id;
  }
  file.envelopesFolderId = folderId;
  return folderId;
}
