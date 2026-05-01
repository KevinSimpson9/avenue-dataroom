// /api/file - Resolves a document key to a Drive viewer URL or, for folder-typed slots,
// returns the list of files inside the folder so the room can render an in-app picker.
import { verifySession } from './_auth.js';
import { google } from 'googleapis';

const DOC_MAP = {
  'deck':         'DRIVE_FILE_DECK',
  'appraisal':    'DRIVE_FILE_APPRAISAL',
  'bov':          'DRIVE_FILE_BOV',
  'casa':         'DRIVE_FILE_CASA',
  'approvals':    'DRIVE_FILE_APPROVALS',
  'budget':       'DRIVE_FILE_BUDGET',
  'plans':        'DRIVE_FILE_PLANS',
  'track-record': 'DRIVE_FILE_TRACK_RECORD'
};

function fileViewerUrl(id) {
  return `https://drive.google.com/file/d/${id}/view`;
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';

async function listChildren(drive, folderId) {
  const response = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType, webViewLink)',
    orderBy: 'name',
    pageSize: 500,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: 'allDrives'
  });
  return response.data.files || [];
}

async function listFolderItems(rootFolderId) {
  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) throw new Error('Service account not configured');

  const credentials = JSON.parse(serviceAccountKey);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly']
  });
  const drive = google.drive({ version: 'v3', auth });

  // BFS through sub-folders, flattening files. Cap at 200 files / depth 5 for safety.
  const results = [];
  const queue = [{ id: rootFolderId, depth: 0 }];
  const visited = new Set();
  while (queue.length && results.length < 200) {
    const { id, depth } = queue.shift();
    if (visited.has(id) || depth > 5) continue;
    visited.add(id);
    const children = await listChildren(drive, id);
    for (const child of children) {
      if (child.mimeType === FOLDER_MIME) {
        queue.push({ id: child.id, depth: depth + 1 });
      } else {
        results.push({
          name: child.name,
          mimeType: child.mimeType,
          url: child.webViewLink || fileViewerUrl(child.id)
        });
      }
    }
  }
  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}

export default async function handler(req, res) {
  if (!verifySession(req)) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }

  const docKey = req.query.doc;
  const envVar = DOC_MAP[docKey];
  if (!envVar) {
    return res.status(404).json({ ok: false, message: 'Unknown document.' });
  }

  const value = process.env[envVar];
  if (!value) {
    return res.status(404).json({
      ok: false,
      message: 'Will update soon.'
    });
  }

  const trimmed = value.trim();

  // Folder-typed slot → return list of files for in-app picker
  if (trimmed.startsWith('folder:')) {
    const folderId = trimmed.slice(7);
    try {
      const items = await listFolderItems(folderId);
      return res.status(200).json({ ok: true, type: 'folder', items });
    } catch (err) {
      console.error('folder list error:', err);
      // Fallback: send the user to the Drive folder browser
      return res.status(200).json({
        ok: true,
        type: 'url',
        url: `https://drive.google.com/drive/folders/${folderId}`
      });
    }
  }

  // Full URL passthrough
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return res.status(200).json({ ok: true, type: 'url', url: trimmed });
  }

  // Bare file ID
  return res.status(200).json({ ok: true, type: 'url', url: fileViewerUrl(trimmed) });
}
