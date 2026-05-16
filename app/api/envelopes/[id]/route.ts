import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentSession } from '@/lib/auth/session';
import { requireAdmin } from '@/lib/auth/current-user';
import { verifyToken } from '@/lib/auth/tokens';
import { BRANDING } from '@/lib/config/branding';
import {
  canRecipientSignNow,
  findEnvelope,
  findRecipient,
  loadEnvelopes,
  pickLowestOrderRecipient,
  updateEnvelopes,
  type Envelope,
  type Field,
  type FieldType,
  type Recipient,
} from '@/lib/drive/envelopes';
import {
  downloadFile,
  getDrive,
  uploadFile,
} from '@/lib/drive/registry';
import {
  inviteRecipient,
  lookupAdminName,
  round2,
  sanitizeRecipients,
} from '@/lib/envelope-helpers';
import { flattenEnvelope, todayLong } from '@/lib/pdf/flatten';
import { sendEnvelopeExecutedCopy } from '@/lib/email/resend';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  enforceOrder: z.boolean().optional(),
  ccAdmin: z.boolean().optional(),
  recipients: z
    .array(
      z.object({
        email: z.string().optional(),
        name: z.string().optional(),
        role: z.string().optional(),
        order: z.coerce.number().optional(),
      })
    )
    .optional(),
  fields: z
    .array(
      z.object({
        id: z.string().optional(),
        recipientId: z.string(),
        type: z.enum(['signature', 'initials', 'date', 'text']),
        page: z.coerce.number().int().min(1),
        x: z.coerce.number(),
        y: z.coerce.number(),
        width: z.coerce.number().positive(),
        height: z.coerce.number().positive(),
        required: z.boolean().optional(),
        defaultValue: z.string().nullable().optional(),
      })
    )
    .optional(),
});

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('send') }),
  z.object({ action: z.literal('void') }),
  z.object({ action: z.literal('resend-invite'), recipientId: z.string() }),
  z.object({
    action: z.literal('sign'),
    token: z.string(),
    fields: z.array(z.object({ id: z.string(), value: z.string() })),
  }),
]);

export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const session = await getCurrentSession();
  const url = new URL(req.url);
  const tokenParam = url.searchParams.get('token');

  const file = await loadEnvelopes();
  const env = findEnvelope(file, id);
  if (!env) return NextResponse.json({ ok: false, message: 'Not found' }, { status: 404 });

  // Admins: full read.
  if (session?.role === 'admin') {
    return NextResponse.json({ ok: true, envelope: env });
  }

  // Recipient via token: filter down to their fields + the metadata they need.
  if (tokenParam) {
    const v = verifyToken(tokenParam);
    if (v && v.purpose === 'sign-envelope') {
      const [envId, nonce] = v.nonce.split(':');
      if (envId === env.id) {
        const recipient = env.recipients.find(
          (r) => r.email === v.email && r.signNonce === nonce
        );
        if (recipient) {
          return NextResponse.json({
            ok: true,
            envelope: scrubEnvelopeForRecipient(env, recipient),
            recipient,
          });
        }
      }
    }
  }

  // Signed-in investor recipient: allowed if their email matches a recipient.
  if (session?.role === 'investor') {
    const recipient = env.recipients.find((r) => r.email === session.email);
    if (recipient) {
      return NextResponse.json({
        ok: true,
        envelope: scrubEnvelopeForRecipient(env, recipient),
        recipient,
      });
    }
  }

  return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
}

function scrubEnvelopeForRecipient(env: Envelope, recipient: Recipient) {
  return {
    id: env.id,
    title: env.title,
    status: env.status,
    sourcePdfName: env.sourcePdfName,
    enforceOrder: env.enforceOrder,
    recipients: env.recipients.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      order: r.order,
      signedAt: r.signedAt,
    })),
    fields: env.fields.filter((f) => f.recipientId === recipient.id),
    canSignNow: canRecipientSignNow(env, recipient),
  };
}

export async function PATCH(req: Request, { params }: Params) {
  await requireAdmin();
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid' },
      { status: 400 }
    );
  }

  const result = await updateEnvelopes((f) => {
    const env = findEnvelope(f, id);
    if (!env) return f;
    if (env.status !== 'draft') {
      throw new HttpError('Only drafts can be edited.', 400);
    }
    if (parsed.data.title) env.title = parsed.data.title.slice(0, 200);
    if (typeof parsed.data.enforceOrder === 'boolean') env.enforceOrder = parsed.data.enforceOrder;
    if (typeof parsed.data.ccAdmin === 'boolean') env.ccAdmin = parsed.data.ccAdmin;

    if (parsed.data.recipients) {
      const byEmail = new Map(env.recipients.map((r) => [r.email.toLowerCase(), r]));
      const { list, errors } = sanitizeRecipients(parsed.data.recipients);
      if (errors.length) throw new HttpError(errors.join(' '), 400);
      env.recipients = list.map((r) => {
        const existing = byEmail.get(r.email.toLowerCase());
        return existing ? { ...existing, name: r.name, role: r.role, order: r.order } : r;
      });
    }

    if (parsed.data.fields) {
      const validRecipientIds = new Set(env.recipients.map((r) => r.id));
      const validTypes = new Set<FieldType>(['signature', 'initials', 'date', 'text']);
      const cleaned: Field[] = [];
      for (const f of parsed.data.fields) {
        if (!validTypes.has(f.type)) continue;
        if (!validRecipientIds.has(f.recipientId)) continue;
        cleaned.push({
          id: typeof f.id === 'string' && f.id.length >= 8 ? f.id : crypto.randomUUID(),
          recipientId: f.recipientId,
          type: f.type,
          page: f.page,
          x: round2(f.x),
          y: round2(f.y),
          width: round2(f.width),
          height: round2(f.height),
          required: f.required !== false,
          status: 'confirmed',
          defaultValue: f.defaultValue ?? null,
          filledValue: null,
          filledAt: null,
        });
      }
      env.fields = cleaned;
    }
    return f;
  }).catch((err) => {
    if (err instanceof HttpError) return err;
    throw err;
  });

  if (result instanceof HttpError) {
    return NextResponse.json({ ok: false, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid' },
      { status: 400 }
    );
  }

  switch (parsed.data.action) {
    case 'send':
      return doSend(id);
    case 'void':
      return doVoid(id);
    case 'resend-invite':
      return doResend(id, parsed.data.recipientId);
    case 'sign':
      return doSign(req, id, parsed.data.token, parsed.data.fields);
  }
}

class HttpError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

// -------- Actions --------

async function doSend(id: string) {
  const session = await requireAdmin();
  const senderName = await lookupAdminName(session.email);
  const outcome: { value: { envelope: Envelope; toInvite: Recipient[] } | null } = {
    value: null,
  };

  const result = await updateEnvelopes((f) => {
    const env = findEnvelope(f, id);
    if (!env) throw new HttpError('Envelope not found.', 404);
    if (env.status !== 'draft') throw new HttpError('Envelope is not a draft.', 400);
    if (!env.recipients.length) throw new HttpError('Add at least one recipient before sending.', 400);
    if (!env.fields.length) throw new HttpError('Place at least one field before sending.', 400);
    const fieldRecipients = new Set(env.fields.map((x) => x.recipientId));
    for (const r of env.recipients) {
      if (!fieldRecipients.has(r.id)) {
        throw new HttpError(`Recipient "${r.name}" has no fields assigned.`, 400);
      }
    }
    env.status = 'sent';
    env.sentAt = new Date().toISOString();
    const toInvite = env.enforceOrder
      ? [pickLowestOrderRecipient(env)].filter((r): r is Recipient => !!r)
      : env.recipients.slice();
    outcome.value = { envelope: env, toInvite };
    return f;
  }).catch((err) => {
    if (err instanceof HttpError) return err;
    throw err;
  });

  if (result instanceof HttpError) {
    return NextResponse.json({ ok: false, message: result.message }, { status: result.status });
  }
  if (!outcome.value) return NextResponse.json({ ok: false }, { status: 500 });

  // Send invites and record invitedAt. Failures are surfaced to the admin.
  const inviteResults: { email: string; sent: boolean; reason?: string }[] = [];
  const okEmails: string[] = [];
  for (const r of outcome.value.toInvite) {
    const res = await inviteRecipient(outcome.value.envelope, r, senderName).catch((e) => ({
      sent: false,
      reason: e instanceof Error ? e.message : String(e),
    }));
    inviteResults.push({ email: r.email, sent: !!res.sent, reason: res.reason });
    if (res.sent) okEmails.push(r.email);
  }
  if (okEmails.length) {
    await updateEnvelopes((f) => {
      const env = findEnvelope(f, id);
      if (!env) return f;
      const now = env.sentAt!;
      for (const r of env.recipients) {
        if (okEmails.includes(r.email)) r.invitedAt = now;
      }
      return f;
    });
  }

  const failed = inviteResults.filter((r) => !r.sent);
  if (failed.length === inviteResults.length && inviteResults.length > 0) {
    return NextResponse.json({
      ok: false,
      message: `Envelope marked sent but no invitations went out. ${failed[0].reason || 'Email service error.'}`,
    });
  }
  if (failed.length) {
    return NextResponse.json({
      ok: true,
      warning: `Some invitations failed: ${failed.map((f) => f.email).join(', ')}.`,
    });
  }
  return NextResponse.json({ ok: true });
}

async function doVoid(id: string) {
  await requireAdmin();
  const result = await updateEnvelopes((f) => {
    const env = findEnvelope(f, id);
    if (!env) throw new HttpError('Envelope not found.', 404);
    if (env.status === 'executed') throw new HttpError('Cannot void an executed envelope.', 400);
    env.status = 'voided';
    return f;
  }).catch((err) => (err instanceof HttpError ? err : Promise.reject(err)));
  if (result instanceof HttpError) {
    return NextResponse.json({ ok: false, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}

async function doResend(id: string, recipientId: string) {
  const session = await requireAdmin();
  const senderName = await lookupAdminName(session.email);

  let rWrap: { value: { env: Envelope; recipient: Recipient } | null } = { value: null };
  const result = await updateEnvelopes((f) => {
    const env = findEnvelope(f, id);
    if (!env) throw new HttpError('Envelope not found.', 404);
    if (env.status !== 'sent' && env.status !== 'partially-signed') {
      throw new HttpError('Envelope is not in a sendable state.', 400);
    }
    const recipient = findRecipient(env, recipientId);
    if (!recipient) throw new HttpError('Recipient not found.', 404);
    if (recipient.signedAt) throw new HttpError('Recipient has already signed.', 400);
    recipient.signNonce = crypto.randomBytes(8).toString('hex');
    recipient.invitedAt = new Date().toISOString();
    rWrap.value = { env, recipient };
    return f;
  }).catch((err) => (err instanceof HttpError ? err : Promise.reject(err)));

  if (result instanceof HttpError) {
    return NextResponse.json({ ok: false, message: result.message }, { status: result.status });
  }
  if (!rWrap.value) return NextResponse.json({ ok: false }, { status: 500 });

  const out = await inviteRecipient(rWrap.value.env, rWrap.value.recipient, senderName);
  if (!out.sent) {
    return NextResponse.json(
      { ok: false, message: `Email failed: ${out.reason || 'unknown'}` },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}

async function doSign(
  req: Request,
  id: string,
  token: string,
  submitted: { id: string; value: string }[]
) {
  // Authorize: token OR signed-in investor recipient
  const session = await getCurrentSession();
  const tokenAuth = verifyToken(token);
  if (!tokenAuth && session?.role !== 'investor') {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  }

  // Signature data URLs can be tens of KB; other field values stay short.
  const submittedById = new Map<string, string>(
    submitted.map((s) => {
      const raw = String(s.value ?? '');
      return [s.id, raw.startsWith('data:image/') ? raw.slice(0, 2_000_000) : raw.slice(0, 200)];
    })
  );

  let outcome: {
    env: Envelope;
    recipient: Recipient;
    allSigned: boolean;
  } | null = null;
  let signedBytes: Uint8Array | null = null;

  const result = await updateEnvelopes(async (f) => {
    const env = findEnvelope(f, id);
    if (!env) throw new HttpError('Envelope not found.', 404);
    if (env.status === 'voided') throw new HttpError('This envelope has been voided.', 410);
    if (env.status === 'executed') throw new HttpError('Already fully executed.', 409);

    let recipient: Recipient | undefined;
    if (tokenAuth?.purpose === 'sign-envelope') {
      const [envId, nonce] = tokenAuth.nonce.split(':');
      if (envId !== env.id) throw new HttpError('Unauthorized', 401);
      recipient = env.recipients.find(
        (r) => r.email === tokenAuth.email && r.signNonce === nonce
      );
    }
    if (!recipient && session?.role === 'investor') {
      recipient = env.recipients.find((r) => r.email === session.email);
    }
    if (!recipient) throw new HttpError('Unauthorized', 401);
    if (recipient.signedAt) throw new HttpError('You have already signed this envelope.', 409);
    if (env.enforceOrder && !canRecipientSignNow(env, recipient)) {
      throw new HttpError('It is not yet your turn to sign.', 409);
    }

    const now = new Date().toISOString();
    const myFields = env.fields.filter((x) => x.recipientId === recipient!.id);
    for (const fld of myFields) {
      if (fld.filledValue) continue;
      if (fld.type === 'date') {
        fld.filledValue = todayLong(now);
        fld.filledAt = now;
        continue;
      }
      const raw = submittedById.get(fld.id) || '';
      const v = raw.startsWith('data:image/') ? raw : raw.trim();
      if (!v) {
        if (fld.required !== false) {
          throw new HttpError(
            `Please fill in the required ${fld.type} field on page ${fld.page}.`,
            400
          );
        }
        continue;
      }
      fld.filledValue = v;
      fld.filledAt = now;
    }

    recipient.signedAt = now;
    recipient.signedIp =
      (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null;
    recipient.signedUserAgent = (req.headers.get('user-agent') || '').slice(0, 240);
    recipient.signNonce = crypto.randomBytes(8).toString('hex');

    const allSigned = env.recipients.every((r) => !!r.signedAt);
    if (!allSigned) {
      env.status = 'partially-signed';
      outcome = { env, recipient, allSigned: false };
      return f;
    }

    // Everyone signed — flatten and upload.
    const source = await downloadFile(getDrive(), env.sourcePdfId);
    signedBytes = await flattenEnvelope(source, env.fields);
    const safe = (env.title || 'envelope').replace(/[^A-Za-z0-9._\- ]+/g, '').slice(0, 60) || 'envelope';
    const uploaded = await uploadFile(
      getDrive(),
      env.destinationFolderId,
      `${safe}-executed.pdf`,
      'application/pdf',
      Buffer.from(signedBytes)
    );
    env.executedPdfId = uploaded.id;
    env.executedAt = now;
    env.status = 'executed';
    outcome = { env, recipient, allSigned: true };
    return f;
  }).catch((err) => (err instanceof HttpError ? err : Promise.reject(err)));

  if (result instanceof HttpError) {
    return NextResponse.json({ ok: false, message: result.message }, { status: result.status });
  }
  if (!outcome) return NextResponse.json({ ok: false }, { status: 500 });

  // Fire-and-forget post-sign side effects.
  const o = outcome as { env: Envelope; recipient: Recipient; allSigned: boolean };
  if (!o.allSigned && o.env.enforceOrder) {
    const next = pickLowestOrderRecipient(o.env);
    if (next) {
      const senderName = await lookupAdminName(o.env.createdBy);
      inviteRecipient(o.env, next, senderName)
        .then((res) => {
          if (res.sent) {
            updateEnvelopes((f) => {
              const env = findEnvelope(f, id);
              const r = env ? findRecipient(env, next.id) : null;
              if (r) r.invitedAt = new Date().toISOString();
              return f;
            }).catch(() => {});
          }
        })
        .catch(() => {});
    }
  }
  if (o.allSigned && signedBytes) {
    const allEmails = Array.from(
      new Set(o.env.recipients.map((r) => r.email).filter(Boolean))
    );
    const safe = (o.env.title || 'envelope').replace(/[^A-Za-z0-9._\- ]+/g, '').slice(0, 60) || 'envelope';
    const bcc = BRANDING.envelopeBcc.filter(
      (a) => !allEmails.map((e) => e.toLowerCase()).includes(a.toLowerCase())
    );
    sendEnvelopeExecutedCopy({
      to: allEmails,
      envelopeTitle: o.env.title,
      pdfBytes: signedBytes,
      pdfFilename: `${safe}-executed.pdf`,
      bcc: bcc.length ? bcc : undefined,
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, allSigned: o.allSigned });
}
