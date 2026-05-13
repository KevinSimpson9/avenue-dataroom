// POST /api/sign-promissory — investor counter-signs as Creditor.
//
// Body: { typedSignature, agreed }
// Auth: investor session. Their identity is taken from the session (NOT from the body).
import { verifyPortalSession } from './_portal-auth.js';
import { loadRegistry, findByEmail, updateEntry, saveRegistry, downloadFile, uploadFile } from './_portal-registry.js';
import { signAsInvestor } from './_promissory-sign.js';
import { sendExecutedCopy, sendKevinInvestorSignedNotice } from './_portal-email.js';

const KEVIN_EMAIL = 'Kevin@AKCapital.fund';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method not allowed' });

  const session = verifyPortalSession(req);
  if (!session || session.role !== 'investor') {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }

  const typedSignature = String(req.body?.typedSignature || '').trim();
  const agreed = !!req.body?.agreed;
  if (!agreed) return res.status(400).json({ ok: false, message: 'You must acknowledge the terms.' });
  if (!typedSignature) return res.status(400).json({ ok: false, message: 'Typed signature is required.' });

  let registry, fileId, drive;
  try { ({ registry, fileId, drive } = await loadRegistry()); }
  catch (err) {
    console.error('sign-promissory: load registry failed', err);
    return res.status(500).json({ ok: false, message: 'Server not configured.' });
  }

  const entry = findByEmail(registry, session.email);
  if (!entry || entry.role !== 'investor') {
    return res.status(404).json({ ok: false, message: 'Investor not found.' });
  }
  if (entry.deletedAt) return res.status(403).json({ ok: false, message: 'Access revoked.' });

  // Typed signature must match the name on file
  if (typedSignature.toLowerCase() !== String(entry.name || '').toLowerCase()) {
    return res.status(400).json({ ok: false, message: 'Typed signature must match your full legal name on file.' });
  }
  if (entry.signedAt) {
    return res.status(409).json({ ok: false, message: 'You have already signed this note.' });
  }
  if (!entry.lukasSignedAt || !entry.lukasSignedPdfId) {
    return res.status(409).json({ ok: false, message: 'Your note is not yet ready to sign. Lukas must sign first.' });
  }

  // Sign on top of the Lukas-signed PDF
  let signedBytes;
  try {
    const lukasSignedBytes = await downloadFile(drive, entry.lukasSignedPdfId);
    signedBytes = await signAsInvestor(lukasSignedBytes, {
      typedSignature: entry.name,
      dateIso: new Date().toISOString()
    });
  } catch (err) {
    console.error('sign-promissory: signing failed', err);
    return res.status(500).json({ ok: false, message: 'Could not sign PDF.' });
  }

  // Upload fully-executed PDF
  let uploaded;
  try {
    uploaded = await uploadFile(drive, entry.folderId, 'signed-promissory-note.pdf', 'application/pdf', signedBytes);
  } catch (err) {
    console.error('sign-promissory: upload failed', err);
    return res.status(500).json({ ok: false, message: 'Could not save executed PDF to Drive.' });
  }

  updateEntry(registry, entry.email, {
    signedAt: new Date().toISOString(),
    signedPdfId: uploaded.id
  });
  await saveRegistry(drive, fileId, registry);

  // Email investor with executed copy + BCC Kevin
  sendExecutedCopy({
    to: entry.email,
    name: entry.name,
    principal: entry.principal,
    pdfBytes: signedBytes,
    pdfFilename: `${slugify(entry.name)}-promissory-note-executed.pdf`,
    bcc: KEVIN_EMAIL
  }).catch(err => console.warn('sign-promissory: email investor failed', err));

  // Notify Kevin separately so it lands in his inbox even if BCC is filtered
  sendKevinInvestorSignedNotice({
    to: KEVIN_EMAIL,
    investorName: entry.name,
    principal: entry.principal
  }).catch(err => console.warn('sign-promissory: notify Kevin failed', err));

  return res.status(200).json({ ok: true });
}

function slugify(s) {
  return String(s || 'investor').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}
