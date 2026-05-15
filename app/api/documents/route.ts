import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import {
  findByEmail,
  getDrive,
  listFolderFiles,
  loadRegistry,
  type InvestorEntry,
  uploadFile,
} from '@/lib/drive/registry';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/documents              -> investor: their own folder; admin: requires ?investor=email
 * POST /api/documents             -> admin only; multipart: investor=email, file=<File>
 */
export async function GET(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const url = new URL(req.url);
  let targetEmail: string | null = null;

  if (session.role === 'admin') {
    targetEmail = url.searchParams.get('investor');
    if (!targetEmail) {
      return NextResponse.json(
        { ok: false, message: '?investor=email required for admin' },
        { status: 400 }
      );
    }
  } else {
    targetEmail = session.email;
  }

  const registry = await loadRegistry();
  const entry = findByEmail(registry, targetEmail);
  if (!entry || entry.role !== 'investor') {
    return NextResponse.json({ ok: false, message: 'Not found' }, { status: 404 });
  }
  const investor = entry as InvestorEntry;
  if (!investor.folderId) {
    return NextResponse.json({ ok: true, files: [] });
  }
  const drive = getDrive();
  const files = await listFolderFiles(drive, investor.folderId);
  return NextResponse.json({ ok: true, files });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const form = await req.formData();
  const investorEmail = String(form.get('investor') || '');
  const file = form.get('file');
  if (!investorEmail || !(file instanceof File)) {
    return NextResponse.json(
      { ok: false, message: 'investor and file are required' },
      { status: 400 }
    );
  }
  if (file.size > 50 * 1024 * 1024) {
    return NextResponse.json(
      { ok: false, message: 'File too large (max 50MB).' },
      { status: 413 }
    );
  }

  const registry = await loadRegistry();
  const entry = findByEmail(registry, investorEmail);
  if (!entry || entry.role !== 'investor' || !(entry as InvestorEntry).folderId) {
    return NextResponse.json({ ok: false, message: 'Investor not found' }, { status: 404 });
  }
  const investor = entry as InvestorEntry;

  const bytes = Buffer.from(await file.arrayBuffer());
  const drive = getDrive();
  const created = await uploadFile(
    drive,
    investor.folderId!,
    file.name,
    file.type || 'application/octet-stream',
    bytes
  );
  return NextResponse.json({ ok: true, file: created });
}
