// POST /api/portal/add-investor — admin-only.
// Multipart form-data:
//   - name (text)
//   - email (text)
//   - principal (text, dollars as integer or "$125,000")
//   - rate (text, default "20% per annum")
//   - termMonths (text, default 20)
//   - blankPdf (file) — the investor's pre-customized blank promissory note PDF
//
// Creates a Drive subfolder, uploads the PDF as blank-promissory-note.pdf,
// appends a registry entry, and emails Lukas that a new note awaits his signature.
import formidable from 'formidable';
import fs from 'fs';
import { requireAdmin } from './_portal-auth.js';
import { loadRegistry, findByEmail, normalizeEmail, saveRegistry, createInvestorFolder, uploadFile } from './_portal-registry.js';
import { sendLukasNewNoteNotice } from './_portal-email.js';

export const config = {
  api: { bodyParser: false }
};

const SEED_LUKAS_EMAIL = 'bondysconstruction@gmail.com';

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  let fields, files;
  try {
    const form = formidable({ multiples: false, maxFileSize: 25 * 1024 * 1024 });
    ({ fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => err ? reject(err) : resolve({ fields, files }));
    }));
  } catch (err) {
    console.error('portal-add-investor: form parse failed', err);
    return res.status(400).json({ ok: false, message: 'Could not parse form. Make sure the PDF is under 25MB.' });
  }

  const name = String(firstVal(fields.name) || '').trim();
  const email = normalizeEmail(firstVal(fields.email));
  const principal = parsePrincipal(firstVal(fields.principal));
  const rate = String(firstVal(fields.rate) || '20% per annum').trim();
  const termMonths = parseInt(String(firstVal(fields.termMonths) || '20'), 10) || 20;
  const file = Array.isArray(files.blankPdf) ? files.blankPdf[0] : files.blankPdf;

  if (!name) return res.status(400).json({ ok: false, message: 'Name is required.' });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ ok: false, message: 'Valid email is required.' });
  if (!principal) return res.status(400).json({ ok: false, message: 'Principal must be a positive number.' });
  if (!file) return res.status(400).json({ ok: false, message: 'Blank PDF is required.' });

  let registry, fileId, drive;
  try { ({ registry, fileId, drive } = await loadRegistry()); }
  catch (err) {
    console.error('portal-add-investor: load registry failed', err);
    return res.status(500).json({ ok: false, message: 'Server not configured.' });
  }

  // Deduplicate
  if (findByEmail(registry, email)) {
    return res.status(409).json({ ok: false, message: 'An investor with that email already exists.' });
  }

  // Read PDF
  const pdfBytes = fs.readFileSync(file.filepath);

  // Create Drive subfolder + upload
  let folder, uploaded;
  try {
    folder = await createInvestorFolder(drive, name);
    uploaded = await uploadFile(drive, folder.id, 'blank-promissory-note.pdf', 'application/pdf', pdfBytes);
  } catch (err) {
    console.error('portal-add-investor: drive write failed', err);
    return res.status(500).json({ ok: false, message: 'Could not save to Drive.' });
  }

  // Append registry entry
  const entry = {
    role: 'investor',
    name,
    email,
    principal,
    rate,
    termMonths,
    folderId: folder.id,
    blankPdfId: uploaded.id,
    passwordHash: null,
    passwordCreatedAt: null,
    resetNonce: null,
    lukasSignedAt: null,
    lukasSignedPdfId: null,
    signedAt: null,
    signedPdfId: null,
    deletedAt: null
  };
  registry.entries.push(entry);
  await saveRegistry(drive, fileId, registry);

  // Notify Lukas
  sendLukasNewNoteNotice({ to: SEED_LUKAS_EMAIL, investorName: name, principal })
    .catch(err => console.warn('portal-add-investor: Lukas email failed', err));

  return res.status(200).json({ ok: true, investor: { name, email, principal, folderId: folder.id } });
}

function firstVal(v) { return Array.isArray(v) ? v[0] : v; }
function parsePrincipal(v) {
  if (v == null) return null;
  const cleaned = String(v).replace(/[^0-9.]/g, '');
  const n = Math.round(parseFloat(cleaned));
  return Number.isFinite(n) && n > 0 ? n : null;
}
