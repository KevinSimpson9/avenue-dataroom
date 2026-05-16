import crypto from 'node:crypto';
import { BRANDING } from './config/branding';
import {
  findByEmail,
  loadRegistry,
  normalizeEmail,
} from './drive/registry';
import { issueToken } from './auth/tokens';
import { sendEnvelopeInvite } from './email/resend';
import type { Envelope, Recipient } from './drive/envelopes';

export interface RecipientInput {
  email?: string;
  name?: string;
  role?: string;
  order?: number;
}

export interface SanitizedRecipients {
  list: Recipient[];
  errors: string[];
}

export function sanitizeRecipients(raw: RecipientInput[]): SanitizedRecipients {
  const errors: string[] = [];
  const out: Recipient[] = [];
  const seen = new Set<string>();
  raw.forEach((r, idx) => {
    const email = normalizeEmail(r?.email);
    const name = String(r?.name || '').trim();
    const role = r?.role ? String(r.role).slice(0, 80) : '';
    const order = Number.isFinite(Number(r?.order))
      ? Math.max(1, Math.floor(Number(r.order)))
      : idx + 1;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push(`Recipient ${idx + 1}: valid email required.`);
      return;
    }
    if (!name) {
      errors.push(`Recipient ${idx + 1}: name required.`);
      return;
    }
    if (seen.has(email)) {
      errors.push(`Duplicate recipient: ${email}.`);
      return;
    }
    seen.add(email);
    out.push({
      id: crypto.randomUUID(),
      email,
      name,
      role,
      order,
      signNonce: crypto.randomBytes(8).toString('hex'),
      invitedAt: null,
      signedAt: null,
      signedIp: null,
      signedUserAgent: null,
    });
  });
  if (out.length === 0 && errors.length === 0) {
    errors.push('At least one recipient is required.');
  }
  return { list: out, errors };
}

export async function lookupAdminName(adminEmail: string): Promise<string> {
  try {
    const registry = await loadRegistry();
    const entry = findByEmail(registry, adminEmail);
    return entry?.name || `${BRANDING.orgShortName} admin`;
  } catch {
    return `${BRANDING.orgShortName} admin`;
  }
}

export async function inviteRecipient(
  env: Envelope,
  recipient: Recipient,
  senderName: string
) {
  const token = issueToken({
    email: recipient.email,
    purpose: 'sign-envelope',
    nonce: `${env.id}:${recipient.signNonce}`,
  });
  const bccCandidates = env.ccAdmin === false
    ? []
    : BRANDING.envelopeBcc.filter((a) => normalizeEmail(a) !== normalizeEmail(recipient.email));
  return sendEnvelopeInvite({
    to: recipient.email,
    recipientName: recipient.name,
    envelopeTitle: env.title,
    senderName,
    token,
    envelopeId: env.id,
    bcc: bccCandidates.length ? bccCandidates : undefined,
  });
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
