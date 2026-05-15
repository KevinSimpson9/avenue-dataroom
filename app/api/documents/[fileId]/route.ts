import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import {
  downloadFile,
  findByEmail,
  getDrive,
  listFolderFiles,
  loadRegistry,
  type InvestorEntry,
} from '@/lib/drive/registry';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ fileId: string }> };

/**
 * GET /api/documents/[fileId]   -> stream the bytes back (auth-gated)
 * DELETE /api/documents/[fileId] -> admin only; trashes the Drive file
 *
 * Authorization: a non-admin can only fetch files that live in their own
 * investor folder. We enforce this by listing their folder and confirming
 * the requested fileId is present there.
 */
export async function GET(req: Request, { params }: Params) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const { fileId } = await params;
  const drive = getDrive();

  if (session.role !== 'admin') {
    const registry = await loadRegistry();
    const entry = findByEmail(registry, session.email);
    if (!entry || entry.role !== 'investor' || !(entry as InvestorEntry).folderId) {
      return NextResponse.json({ ok: false }, { status: 404 });
    }
    const files = await listFolderFiles(drive, (entry as InvestorEntry).folderId!);
    if (!files.some((f) => f.id === fileId)) {
      return NextResponse.json({ ok: false }, { status: 403 });
    }
  }

  // Fetch metadata for filename + mime, then the bytes.
  const meta = await drive.files.get({
    fileId,
    fields: 'id, name, mimeType',
    supportsAllDrives: true,
  });
  const bytes = await downloadFile(drive, fileId);
  const filename = meta.data.name || 'download';
  const mime = meta.data.mimeType || 'application/octet-stream';

  const inline = new URL(req.url).searchParams.get('inline') === '1';
  const disposition = `${inline ? 'inline' : 'attachment'}; filename="${filename.replace(/"/g, '')}"`;

  // Wrap as Uint8Array for proper Response body typing.
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Length': String(bytes.length),
      'Content-Disposition': disposition,
      'Cache-Control': 'private, no-store',
    },
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await getCurrentSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const { fileId } = await params;
  const drive = getDrive();
  await drive.files.update({
    fileId,
    requestBody: { trashed: true },
    supportsAllDrives: true,
  });
  return NextResponse.json({ ok: true });
}
