// GET /api/portal/folder?email=…
// Returns the file list in an investor's Drive subfolder.
// Investor: can only request their own folder (email param ignored, session email used).
// Admin: can request any investor's folder by email.
import { verifyPortalSession } from './_portal-auth.js';
import { loadRegistry, findByEmail, listFolderFiles, normalizeEmail } from './_portal-registry.js';

export default async function handler(req, res) {
  const session = verifyPortalSession(req);
  if (!session) return res.status(401).json({ ok: false, message: 'Unauthorized' });

  let registry, drive;
  try { ({ registry, drive } = await loadRegistry()); }
  catch (err) {
    console.error('portal-folder: load registry failed', err);
    return res.status(500).json({ ok: false, message: 'Server not configured.' });
  }

  // Decide which email's folder to list
  const requestedEmail = normalizeEmail(req.query?.email);
  let targetEmail;
  if (session.role === 'admin') {
    targetEmail = requestedEmail || session.email;
  } else {
    targetEmail = session.email;
  }

  const entry = findByEmail(registry, targetEmail);
  if (!entry || entry.role !== 'investor') {
    return res.status(404).json({ ok: false, message: 'Investor not found.' });
  }
  if (entry.deletedAt && session.role !== 'admin') {
    return res.status(403).json({ ok: false, message: 'Access revoked.' });
  }

  let files = [];
  if (entry.folderId) {
    try {
      files = await listFolderFiles(drive, entry.folderId);
    } catch (err) {
      console.error('portal-folder: list folder failed', err);
    }
  }

  return res.status(200).json({
    ok: true,
    investor: {
      name: entry.name,
      email: entry.email,
      principal: entry.principal,
      rate: entry.rate,
      termMonths: entry.termMonths,
      lukasSignedAt: entry.lukasSignedAt || null,
      signedAt: entry.signedAt || null
    },
    files: files.map(f => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      createdTime: f.createdTime,
      url: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`
    }))
  });
}
