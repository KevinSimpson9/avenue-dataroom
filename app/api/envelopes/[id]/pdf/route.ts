import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { verifyToken } from '@/lib/auth/tokens';
import {
  findEnvelope,
  loadEnvelopes,
} from '@/lib/drive/envelopes';
import { downloadFile, getDrive } from '@/lib/drive/registry';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/envelopes/[id]/pdf?which=source|executed&token=...
 * Streams the source or executed PDF. Auth: admin, signed-in recipient, or
 * valid sign-envelope token.
 */
export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const url = new URL(req.url);
  const which = url.searchParams.get('which') === 'executed' ? 'executed' : 'source';
  const tokenParam = url.searchParams.get('token');

  const file = await loadEnvelopes();
  const env = findEnvelope(file, id);
  if (!env) return NextResponse.json({ ok: false }, { status: 404 });

  const session = await getCurrentSession();
  let allowed = session?.role === 'admin';

  if (!allowed && tokenParam) {
    const v = verifyToken(tokenParam);
    if (v?.purpose === 'sign-envelope') {
      const [envId, nonce] = v.nonce.split(':');
      allowed =
        envId === env.id &&
        env.recipients.some((r) => r.email === v.email && r.signNonce === nonce);
    }
  }
  if (!allowed && session?.role === 'investor') {
    allowed = env.recipients.some((r) => r.email === session.email);
  }
  if (!allowed) return NextResponse.json({ ok: false }, { status: 401 });

  const fileId = which === 'executed' ? env.executedPdfId : env.sourcePdfId;
  if (!fileId) return NextResponse.json({ ok: false, message: 'Not available' }, { status: 404 });

  const bytes = await downloadFile(getDrive(), fileId);
  const filename =
    which === 'executed'
      ? `${env.title}-executed.pdf`
      : env.sourcePdfName || `${env.title}.pdf`;

  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(bytes.length),
      'Content-Disposition': `inline; filename="${filename.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
