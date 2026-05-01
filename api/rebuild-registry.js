// /api/rebuild-registry - Admin endpoint: scans every PDF in the NDA folder,
// extracts emails from descriptions and PDF text content, and overwrites
// nda-registry.json with a fresh allowlist.
//
// Auth: pass ?token=<ADMIN_TOKEN> (or REBUILD_TOKEN) in the query string.
// Falls back to SESSION_SECRET if neither admin var is configured.
import { getDrive, findRegistryFile, writeRegistryFile, bootstrapFromFolder } from './_nda-registry.js';

export default async function handler(req, res) {
  const token = String(req.query?.token || '').trim();
  const expected =
    process.env.REGISTRY_REBUILD_TOKEN ||
    process.env.ADMIN_TOKEN ||
    process.env.SESSION_SECRET ||
    '';
  if (!expected || token !== expected) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }

  const folderId = process.env.GOOGLE_DRIVE_NDA_FOLDER_ID;
  if (!folderId || !process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    return res.status(500).json({ ok: false, message: 'Server not configured.' });
  }

  try {
    const drive = getDrive();
    const registry = await bootstrapFromFolder(drive, folderId, { scrapePdfs: true });
    const existing = await findRegistryFile(drive, folderId);
    await writeRegistryFile(drive, folderId, existing ? existing.id : null, registry);
    return res.status(200).json({
      ok: true,
      count: registry.entries.length,
      entries: registry.entries.map(e => ({ email: e.email, name: e.name, signedAt: e.signedAt }))
    });
  } catch (err) {
    console.error('rebuild-registry error:', err);
    return res.status(500).json({ ok: false, message: err.message });
  }
}
