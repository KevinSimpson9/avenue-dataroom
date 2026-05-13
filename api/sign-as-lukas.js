// POST /api/sign-as-lukas — Lukas signs Debtor + Guarantor on a specific
// investor's blank promissory note.
//
// Body: { email, typedSignature, agreed }
// Auth: admin session whose registry entry.name == "Lukas Bondy".
import { verifyPortalSession } from './_portal-auth.js';
import { loadRegistry, findByEmail, normalizeEmail, updateEntry, saveRegistry,
         downloadFile, uploadFile } from './_portal-registry.js';
import { signAsLukas } from './_promissory-sign.js';
import { sendInvestorReadyToSign } from './_portal-email.js';
import { issueToken } from './_portal-auth.js';

const LUKAS_EMAIL = 'bondysconstruction@gmail.com';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method not allowed' });

  const session = verifyPortalSession(req);
  if (!session || session.role !== 'admin') {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }
  // Only Lukas may sign — Kevin cannot sign on his behalf
  if (normalizeEmail(session.email) !== normalizeEmail(LUKAS_EMAIL)) {
    return res.status(403).json({ ok: false, message: 'Only Lukas Bondy can sign as Debtor & Guarantor.' });
  }

  const email = normalizeEmail(req.body?.email);
  const typedSignature = String(req.body?.typedSignature || '').trim();
  const agreed = !!req.body?.agreed;

  if (!email) return res.status(400).json({ ok: false, message: 'Investor email is required.' });
  if (!agreed) return res.status(400).json({ ok: false, message: 'You must acknowledge the terms.' });
  if (typedSignature.toLowerCase() !== 'lukas bondy') {
    return res.status(400).json({ ok: false, message: 'Typed signature must be "Lukas Bondy".' });
  }

  let registry, fileId, drive;
  try { ({ registry, fileId, drive } = await loadRegistry()); }
  catch (err) {
    console.error('sign-as-lukas: load registry failed', err);
    return res.status(500).json({ ok: false, message: 'Server not configured.' });
  }

  const entry = findByEmail(registry, email);
  if (!entry || entry.role !== 'investor') {
    return res.status(404).json({ ok: false, message: 'Investor not found.' });
  }
  if (entry.deletedAt) return res.status(400).json({ ok: false, message: 'Investor has been removed.' });
  if (entry.lukasSignedAt) {
    return res.status(409).json({ ok: false, message: 'You have already signed this note.' });
  }
  if (!entry.blankPdfId) {
    return res.status(400).json({ ok: false, message: 'No blank PDF on file for this investor.' });
  }

  // Sign
  let signedBytes;
  try {
    const blankBytes = await downloadFile(drive, entry.blankPdfId);
    signedBytes = await signAsLukas(blankBytes, {
      typedSignature: 'Lukas Bondy',
      dateIso: new Date().toISOString()
    });
  } catch (err) {
    console.error('sign-as-lukas: signing failed', err);
    return res.status(500).json({ ok: false, message: 'Could not sign PDF.' });
  }

  // Upload Lukas-signed PDF to the investor's folder
  let uploaded;
  try {
    uploaded = await uploadFile(drive, entry.folderId, 'lukas-signed-promissory-note.pdf', 'application/pdf', signedBytes);
  } catch (err) {
    console.error('sign-as-lukas: upload failed', err);
    return res.status(500).json({ ok: false, message: 'Could not save signed PDF to Drive.' });
  }

  // Update registry
  updateEntry(registry, email, {
    lukasSignedAt: new Date().toISOString(),
    lukasSignedPdfId: uploaded.id
  });
  await saveRegistry(drive, fileId, registry);

  // Notify investor (with setup link if they haven't set a password)
  let setupToken = null;
  if (!entry.passwordHash) {
    setupToken = issueToken({ email: entry.email, purpose: 'setup' });
  }
  sendInvestorReadyToSign({
    to: entry.email,
    name: entry.name,
    principal: entry.principal,
    needsSetup: !entry.passwordHash,
    setupToken
  }).catch(err => console.warn('sign-as-lukas: notify investor failed', err));

  return res.status(200).json({ ok: true });
}
