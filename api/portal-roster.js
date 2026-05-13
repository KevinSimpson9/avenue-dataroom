// GET /api/portal/roster
// Admin-only. Returns the full investor list with computed state.
import { requireAdmin } from './_portal-auth.js';
import { loadRegistry } from './_portal-registry.js';

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;

  let registry;
  try { ({ registry } = await loadRegistry()); }
  catch (err) {
    console.error('portal-roster: load registry failed', err);
    return res.status(500).json({ ok: false, message: 'Server not configured.' });
  }

  const investors = registry.entries
    .filter(e => e.role === 'investor')
    .map(e => ({
      name: e.name,
      email: e.email,
      principal: e.principal,
      rate: e.rate,
      termMonths: e.termMonths,
      folderId: e.folderId,
      blankPdfId: e.blankPdfId,
      lukasSignedAt: e.lukasSignedAt || null,
      signedAt: e.signedAt || null,
      passwordCreatedAt: e.passwordCreatedAt || null,
      deletedAt: e.deletedAt || null,
      state: computeState(e)
    }));

  const admins = registry.entries.filter(e => e.role === 'admin').map(e => ({
    name: e.name, email: e.email, hasPassword: !!e.passwordHash
  }));

  return res.status(200).json({
    ok: true,
    investors,
    admins,
    updatedAt: registry.updatedAt
  });
}

function computeState(e) {
  if (e.deletedAt) return 'removed';
  if (e.signedAt) return 'fully-executed';
  if (e.lukasSignedAt) return 'awaiting-investor';
  return 'awaiting-lukas';
}
