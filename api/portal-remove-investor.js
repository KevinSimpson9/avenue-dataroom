// POST /api/portal/remove-investor — admin-only. Soft-delete.
// Body: { email }
import { requireAdmin } from './_portal-auth.js';
import { loadRegistry, findByEmail, normalizeEmail, updateEntry, saveRegistry } from './_portal-registry.js';

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method not allowed' });

  const email = normalizeEmail(req.body?.email);
  if (!email) return res.status(400).json({ ok: false, message: 'Email is required.' });

  let registry, fileId, drive;
  try { ({ registry, fileId, drive } = await loadRegistry()); }
  catch (err) {
    console.error('portal-remove-investor: load registry failed', err);
    return res.status(500).json({ ok: false, message: 'Server not configured.' });
  }

  const entry = findByEmail(registry, email);
  if (!entry || entry.role !== 'investor') {
    return res.status(404).json({ ok: false, message: 'Investor not found.' });
  }
  updateEntry(registry, email, {
    deletedAt: new Date().toISOString(),
    passwordHash: null, // revoke their ability to log in
    resetNonce: null
  });
  await saveRegistry(drive, fileId, registry);

  return res.status(200).json({ ok: true });
}
