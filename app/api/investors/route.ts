import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { requireAdmin } from '@/lib/auth/current-user';
import { createInvestorSchema } from '@/lib/validation';
import {
  createInvestorFolder,
  findByEmail,
  getDrive,
  loadRegistry,
  updateRegistry,
  type InvestorEntry,
} from '@/lib/drive/registry';
import { issueToken } from '@/lib/auth/tokens';
import { sendSetupLink } from '@/lib/email/resend';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  await requireAdmin();
  const registry = await loadRegistry();
  const investors = registry.entries.filter((e) => e.role === 'investor');
  return NextResponse.json({ ok: true, investors });
}

export async function POST(req: Request) {
  await requireAdmin();

  const body = await req.json().catch(() => null);
  const parsed = createInvestorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid' },
      { status: 400 }
    );
  }
  const data = parsed.data;

  // Pre-check: no duplicate (active) email.
  const registry = await loadRegistry();
  if (findByEmail(registry, data.email)) {
    return NextResponse.json(
      { ok: false, message: 'An investor with that email already exists.' },
      { status: 409 }
    );
  }

  // Create the per-investor Drive folder before persisting.
  const drive = getDrive();
  const folder = await createInvestorFolder(drive, data.name);

  const nonce = crypto.randomBytes(8).toString('hex');
  const newEntry: InvestorEntry = {
    role: 'investor',
    name: data.name,
    email: data.email,
    principal: data.principal,
    rate: data.rate,
    termMonths: data.termMonths,
    folderId: folder.id,
    blankPdfId: null,
    passwordHash: null,
    passwordCreatedAt: null,
    resetNonce: nonce,
    lukasSignedAt: null,
    lukasSignedPdfId: null,
    signedAt: null,
    signedPdfId: null,
    deletedAt: null,
  };

  await updateRegistry((r) => {
    if (findByEmail(r, data.email)) return r; // race: another admin beat us; bail.
    r.entries.push(newEntry);
    return r;
  });

  const token = issueToken({ email: data.email, purpose: 'setup', nonce });
  await sendSetupLink({ to: data.email, name: data.name, token });

  return NextResponse.json({ ok: true, investor: newEntry });
}
