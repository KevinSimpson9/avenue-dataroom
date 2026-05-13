// POST /api/portal-upload — subscription doc upload.
// Investor: writes to their own folder.
// Admin: writes to the folder of the investor identified by ?email=… (form field "target" also accepted).
import formidable from 'formidable';
import fs from 'fs';
import { verifyPortalSession } from './_portal-auth.js';
import { loadRegistry, findByEmail, uploadFile, normalizeEmail } from './_portal-registry.js';

export const config = {
  api: { bodyParser: false }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method not allowed' });

  const session = verifyPortalSession(req);
  if (!session) return res.status(401).json({ ok: false, message: 'Unauthorized' });

  let fields, files;
  try {
    const form = formidable({ multiples: false, maxFileSize: 25 * 1024 * 1024 });
    ({ fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => err ? reject(err) : resolve({ fields, files }));
    }));
  } catch (err) {
    console.error('portal-upload: form parse failed', err);
    return res.status(400).json({ ok: false, message: 'Upload failed. Files must be under 25MB.' });
  }

  const file = Array.isArray(files.file) ? files.file[0] : files.file;
  if (!file) return res.status(400).json({ ok: false, message: 'No file provided.' });

  // Decide target folder
  let targetEmail = session.email;
  if (session.role === 'admin') {
    targetEmail = normalizeEmail(firstVal(fields.target)) || targetEmail;
  }

  let registry, drive;
  try { ({ registry, drive } = await loadRegistry()); }
  catch (err) {
    console.error('portal-upload: load registry failed', err);
    return res.status(500).json({ ok: false, message: 'Server not configured.' });
  }

  const entry = findByEmail(registry, targetEmail);
  if (!entry || entry.role !== 'investor' || !entry.folderId) {
    return res.status(404).json({ ok: false, message: 'Folder not found.' });
  }
  if (entry.deletedAt && session.role !== 'admin') {
    return res.status(403).json({ ok: false, message: 'Access revoked.' });
  }

  const buf = fs.readFileSync(file.filepath);
  const mimeType = file.mimetype || 'application/octet-stream';
  const filename = file.originalFilename || file.newFilename || 'upload';

  try {
    const uploaded = await uploadFile(drive, entry.folderId, filename, mimeType, buf);
    return res.status(200).json({ ok: true, file: { id: uploaded.id, name: uploaded.name } });
  } catch (err) {
    console.error('portal-upload: drive write failed', err);
    return res.status(500).json({ ok: false, message: 'Could not save file.' });
  }
}

function firstVal(v) { return Array.isArray(v) ? v[0] : v; }
