// GET /api/portal/me — returns the current portal session's identity (email, role, name).
// Used by the admin dashboard to decide which actions to expose (e.g. "Sign now" only for Lukas).
import { verifyPortalSession } from './_portal-auth.js';
import { loadRegistry, findByEmail } from './_portal-registry.js';

export default async function handler(req, res) {
  const session = verifyPortalSession(req);
  if (!session) return res.status(401).json({ ok: false });

  let registry;
  try { ({ registry } = await loadRegistry()); }
  catch { return res.status(200).json({ ok: true, email: session.email, role: session.role, name: '' }); }

  const entry = findByEmail(registry, session.email, { includeDeleted: true });
  return res.status(200).json({
    ok: true,
    email: session.email,
    role: session.role,
    name: entry?.name || ''
  });
}
