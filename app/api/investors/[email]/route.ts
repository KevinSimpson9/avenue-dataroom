import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { requireAdmin } from '@/lib/auth/current-user';
import { updateInvestorSchema } from '@/lib/validation';
import {
  findByEmail,
  loadRegistry,
  updateRegistry,
  normalizeEmail,
  type InvestorEntry,
} from '@/lib/drive/registry';
import { issueToken } from '@/lib/auth/tokens';
import { sendSetupLink, sendResetLink } from '@/lib/email/resend';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ email: string }> };

async function getInvestor(emailParam: string) {
  const email = decodeURIComponent(emailParam);
  const registry = await loadRegistry();
  const entry = findByEmail(registry, email, { includeDeleted: true });
  if (!entry || entry.role !== 'investor') return null;
  return entry as InvestorEntry;
}

export async function GET(_req: Request, { params }: Params) {
  await requireAdmin();
  const { email } = await params;
  const investor = await getInvestor(email);
  if (!investor) return NextResponse.json({ ok: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true, investor });
}

export async function PATCH(req: Request, { params }: Params) {
  await requireAdmin();
  const { email } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateInvestorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid' },
      { status: 400 }
    );
  }
  const decoded = decodeURIComponent(email);
  let found = false;
  await updateRegistry((r) => {
    const target = findByEmail(r, decoded, { includeDeleted: true });
    if (!target || target.role !== 'investor') return r;
    Object.assign(target, parsed.data);
    found = true;
    return r;
  });
  if (!found) return NextResponse.json({ ok: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Params) {
  await requireAdmin();
  const { email } = await params;
  const decoded = decodeURIComponent(email);
  let found = false;
  await updateRegistry((r) => {
    const target = findByEmail(r, decoded);
    if (!target || target.role !== 'investor') return r;
    (target as InvestorEntry).deletedAt = new Date().toISOString();
    target.passwordHash = null;
    target.resetNonce = null;
    found = true;
    return r;
  });
  if (!found) return NextResponse.json({ ok: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/**
 * POST /api/investors/:email
 *   { action: "resend-setup" | "resend-reset" }
 * Rotates the relevant nonce and re-emails the link.
 */
export async function POST(req: Request, { params }: Params) {
  await requireAdmin();
  const { email } = await params;
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  const decoded = decodeURIComponent(email);

  if (body.action !== 'resend-setup' && body.action !== 'resend-reset') {
    return NextResponse.json({ ok: false, message: 'Unknown action' }, { status: 400 });
  }

  const nonce = crypto.randomBytes(8).toString('hex');
  const outcome: {
    value: { email: string; name: string; alreadyHasPassword: boolean } | null;
  } = { value: null };

  await updateRegistry((r) => {
    const target = findByEmail(r, decoded);
    if (!target || target.role !== 'investor') return r;
    const hadPassword = !!target.passwordHash;
    if (body.action === 'resend-setup') {
      // Setup-link reuse only makes sense if password not yet set; otherwise treat as reset.
      if (hadPassword) target.resetNonce = nonce;
    } else {
      target.resetNonce = nonce;
    }
    outcome.value = {
      email: target.email,
      name: target.name,
      alreadyHasPassword: hadPassword,
    };
    return r;
  });

  if (!outcome.value) {
    return NextResponse.json({ ok: false, message: 'Not found' }, { status: 404 });
  }

  void normalizeEmail;

  const useReset = body.action === 'resend-reset' || outcome.value.alreadyHasPassword;
  const purpose: 'setup' | 'reset' = useReset ? 'reset' : 'setup';
  const token = issueToken({ email: outcome.value.email, purpose, nonce });
  const result = useReset
    ? await sendResetLink({ to: outcome.value.email, name: outcome.value.name, token })
    : await sendSetupLink({ to: outcome.value.email, name: outcome.value.name, token });

  return NextResponse.json({ ok: true, sent: result.sent, reason: result.reason });
}
