import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/current-user';
import {
  getDrive,
  getOrCreateEnvelopesFolder,
  loadEnvelopes,
  updateEnvelopes,
  type Envelope,
} from '@/lib/drive/envelopes';
import {
  findByEmail,
  loadRegistry,
  uploadFile,
  type InvestorEntry,
} from '@/lib/drive/registry';
import { sanitizeRecipients } from '@/lib/envelope-helpers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  await requireAdmin();
  const file = await loadEnvelopes();
  const envelopes = [...file.envelopes].sort((a, b) =>
    (b.createdAt || '').localeCompare(a.createdAt || '')
  );
  return NextResponse.json({ ok: true, envelopes });
}

/**
 * POST /api/envelopes
 * multipart: pdf=<File>, title, enforceOrder, ccAdmin, recipients (JSON array)
 * Creates a draft envelope with the source PDF uploaded to a destination
 * folder (prefers a recipient investor's folder; falls back to shared
 * `Envelopes/`).
 */
export async function POST(req: Request) {
  const session = await requireAdmin();

  const form = await req.formData();
  const pdf = form.get('pdf');
  if (!(pdf instanceof File)) {
    return NextResponse.json({ ok: false, message: 'PDF is required.' }, { status: 400 });
  }
  if (pdf.size > 25 * 1024 * 1024) {
    return NextResponse.json({ ok: false, message: 'PDF too large (max 25MB).' }, { status: 413 });
  }
  const title = String(form.get('title') || '').trim() || 'Untitled envelope';
  const enforceOrder = String(form.get('enforceOrder') || '') === 'true';
  const ccAdmin = String(form.get('ccAdmin') || 'true') !== 'false';

  let recipientsRaw: unknown = [];
  try {
    recipientsRaw = JSON.parse(String(form.get('recipients') || '[]'));
  } catch {
    // ignore
  }
  if (!Array.isArray(recipientsRaw)) recipientsRaw = [];
  const { list: recipients, errors } = sanitizeRecipients(recipientsRaw as []);
  if (errors.length) {
    return NextResponse.json({ ok: false, message: errors.join(' ') }, { status: 400 });
  }

  const pdfBytes = Buffer.from(await pdf.arrayBuffer());
  const sha = crypto.createHash('sha256').update(pdfBytes).digest('hex');

  // Pick destination folder: first known-investor recipient's folder, else shared.
  const drive = getDrive();
  let destFolderId: string | null = null;
  try {
    const registry = await loadRegistry();
    for (const r of recipients) {
      const inv = findByEmail(registry, r.email);
      if (inv && inv.role === 'investor' && (inv as InvestorEntry).folderId) {
        destFolderId = (inv as InvestorEntry).folderId!;
        break;
      }
    }
  } catch {
    // non-fatal; fall through to shared folder
  }

  let env: Envelope | null = null;
  await updateEnvelopes(async (f) => {
    if (!destFolderId) destFolderId = await getOrCreateEnvelopesFolder(drive, f);
    const safeName = title.replace(/[^A-Za-z0-9._\- ]+/g, '').slice(0, 60) || 'envelope';
    const uploaded = await uploadFile(
      drive,
      destFolderId,
      `${safeName}-source.pdf`,
      'application/pdf',
      pdfBytes
    );
    env = {
      id: crypto.randomUUID(),
      title,
      status: 'draft',
      createdBy: session.email,
      createdAt: new Date().toISOString(),
      sentAt: null,
      executedAt: null,
      sourcePdfId: uploaded.id,
      sourcePdfName: pdf.name || `${title}.pdf`,
      sourcePdfSha256: sha,
      executedPdfId: null,
      destinationFolderId: destFolderId,
      enforceOrder,
      ccAdmin,
      recipients,
      fields: [],
    };
    f.envelopes.push(env);
    return f;
  });

  if (!env) {
    return NextResponse.json({ ok: false, message: 'Could not create envelope.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, envelope: env });
}
