import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { authActionSchema } from '@/lib/validation';
import {
  findByEmail,
  loadRegistry,
  updateRegistry,
  type Entry,
  type InvestorEntry,
  type AdminEntry,
} from '@/lib/drive/registry';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { issueToken, verifyToken } from '@/lib/auth/tokens';
import {
  setSessionCookie,
  clearSessionCookie,
} from '@/lib/auth/session';
import { sendResetLink } from '@/lib/email/resend';
import { appendAudit } from '@/lib/drive/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function delay(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid JSON', 400);
  }
  const parsed = authActionSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Invalid request', 400);
  }
  const data = parsed.data;

  switch (data.action) {
    case 'signin':
      return signin(data.email, data.password);
    case 'logout':
      return logout();
    case 'request-reset':
      return requestReset(data.email);
    case 'complete-setup':
      return completeSetup(data.token, data.password);
    case 'complete-reset':
      return completeReset(data.token, data.password);
  }
}

async function signin(email: string, password: string) {
  const registry = await loadRegistry();
  const entry = findByEmail(registry, email);
  // Constant-ish time: even on miss, run a scrypt verify against a sentinel.
  const okHash = entry?.passwordHash
    ? verifyPassword(password, entry.passwordHash)
    : (verifyPassword(password, 'scrypt$0000$0000'), false);
  if (!entry || !okHash) {
    await delay(800);
    return jsonError('Email or password is incorrect.', 401);
  }
  if (entry.role !== 'admin' && entry.role !== 'investor') {
    return jsonError('Account is not active.', 403);
  }
  if ((entry as InvestorEntry).deletedAt) {
    return jsonError('Account is not active.', 403);
  }
  await setSessionCookie({ email: entry.email, role: entry.role });
  await appendAudit({
    actorEmail: entry.email,
    actorRole: entry.role,
    action: 'auth.signin',
    target: entry.email,
  });
  return NextResponse.json({
    ok: true,
    role: entry.role,
    redirect: entry.role === 'admin' ? '/portal/admin' : '/portal/dashboard',
  });
}

async function logout() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}

async function requestReset(email: string) {
  // Always respond OK to avoid leaking which emails are registered.
  const registry = await loadRegistry();
  const entry = findByEmail(registry, email);
  if (!entry) return NextResponse.json({ ok: true });

  const nonce = crypto.randomBytes(8).toString('hex');
  await updateRegistry((r) => {
    for (const e of r.entries) {
      if (e.email.toLowerCase() === entry.email.toLowerCase()) e.resetNonce = nonce;
    }
    return r;
  });
  const token = issueToken({ email: entry.email, purpose: 'reset', nonce });
  await sendResetLink({ to: entry.email, name: entry.name, token });
  return NextResponse.json({ ok: true });
}

async function completeSetup(token: string, password: string) {
  const v = verifyToken(token);
  if (!v || v.purpose !== 'setup') return jsonError('Link is invalid or expired.', 400);

  const outcome: { value: { role: Entry['role']; email: string } | null } = { value: null };
  await updateRegistry((r) => {
    const entry = findByEmail(r, v.email);
    if (!entry) return r;
    // Setup link is single-use: once a password is set, this link no longer works.
    if (entry.passwordHash) return r;
    const ts = new Date().toISOString();
    if (entry.role === 'admin') {
      (entry as AdminEntry).passwordHash = hashPassword(password);
      (entry as AdminEntry).passwordCreatedAt = ts;
    } else {
      (entry as InvestorEntry).passwordHash = hashPassword(password);
      (entry as InvestorEntry).passwordCreatedAt = ts;
    }
    outcome.value = { role: entry.role, email: entry.email };
    return r;
  });
  if (!outcome.value) return jsonError('Setup link is no longer valid.', 400);

  await setSessionCookie({ email: outcome.value.email, role: outcome.value.role });
  return NextResponse.json({
    ok: true,
    role: outcome.value.role,
    redirect: outcome.value.role === 'admin' ? '/portal/admin' : '/portal/dashboard',
  });
}

async function completeReset(token: string, password: string) {
  const v = verifyToken(token);
  if (!v || v.purpose !== 'reset') return jsonError('Link is invalid or expired.', 400);

  const outcome: { value: { role: Entry['role']; email: string } | null } = { value: null };
  await updateRegistry((r) => {
    const entry = findByEmail(r, v.email);
    if (!entry) return r;
    // Reset link is single-use: nonce must match, and is rotated after use.
    if (!entry.resetNonce || entry.resetNonce !== v.nonce) return r;
    entry.passwordHash = hashPassword(password);
    entry.passwordCreatedAt = new Date().toISOString();
    entry.resetNonce = null;
    outcome.value = { role: entry.role, email: entry.email };
    return r;
  });
  if (!outcome.value) return jsonError('Reset link is no longer valid.', 400);

  await setSessionCookie({ email: outcome.value.email, role: outcome.value.role });
  return NextResponse.json({
    ok: true,
    role: outcome.value.role,
    redirect: outcome.value.role === 'admin' ? '/portal/admin' : '/portal/dashboard',
  });
}
