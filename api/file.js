// /api/file - Resolves a document key to a Drive viewer URL or, for folder-typed slots,
// returns the list of files inside the folder so the room can render an in-app picker.
import { verifySession } from './_auth.js';
import { google } from 'googleapis';

const DOC_MAP = {
  'deck':         'DRIVE_FILE_DECK',
  'promissory':   'DRIVE_FILE_PROMISSORY',
  'appraisal':    'DRIVE_FILE_APPRAISAL',
  'casa':         'DRIVE_FILE_CASA',
  'approvals':    'DRIVE_FILE_APPROVALS',
  'budget':       'DRIVE_FILE_BUDGET',
  'plans':        'DRIVE_FILE_PLANS',
  'reservation':  'DRIVE_FILE_RESERVATION',
  'track-record': 'DRIVE_FILE_TRACK_RECORD'
};

function fileViewerUrl(id) {
  return `https://drive.google.com/file/d/${id}/view`;
}

async function listFolderItems(folderId) {
  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) throw new Error('Service account not configured');

  const credentials = JSON.parse(serviceAccountKey);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly']
  });
  const drive = google.drive({ version: 'v3', auth });

  const response = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType, webViewLink)',
    orderBy: 'name',
    pageSize: 200,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: 'allDrives'
  });

  return (response.data.files || []).map(f => ({
    name: f.name,
    mimeType: f.mimeType,
    url: f.webViewLink || fileViewerUrl(f.id)
  }));
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
      message: 'Document not yet uploaded. Contact Kevin@AKCapital.fund for access.'
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
