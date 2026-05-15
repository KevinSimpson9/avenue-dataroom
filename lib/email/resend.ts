import { BRANDING } from '../config/branding';

/**
 * Resend-powered email helpers. Branding is pulled from
 * lib/config/branding.ts so the same module is reusable across projects.
 */

export function baseUrl(): string {
  return (process.env.PORTAL_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
}

interface Attachment {
  filename: string;
  /** base64-encoded content */
  content: string;
}

interface SendArgs {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  bcc?: string | string[];
  attachments?: Attachment[];
}

export interface SendResult {
  sent: boolean;
  reason?: string;
}

export async function send(args: SendArgs): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: 'RESEND_API_KEY not configured' };
  const from = process.env.RESEND_FROM_EMAIL || `${BRANDING.orgShortName} <onboarding@resend.dev>`;
  const replyTo = process.env.RESEND_REPLY_TO || BRANDING.adminEmails[0];

  const payload: Record<string, unknown> = {
    from,
    to: Array.isArray(args.to) ? args.to : [args.to],
    reply_to: replyTo,
    subject: args.subject,
    html: args.html,
    text: args.text,
  };
  if (args.bcc) payload.bcc = Array.isArray(args.bcc) ? args.bcc : [args.bcc];
  if (args.attachments) payload.attachments = args.attachments;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text();
      return { sent: false, reason: `Resend ${res.status}: ${body.slice(0, 240)}` };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

function shell(innerHtml: string): string {
  const accent = BRANDING.colors.accent;
  return `
    <div style="font-family: -apple-system, system-ui, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1a1816; line-height: 1.55;">
      <h2 style="font-family: Georgia, serif; color: ${accent}; margin-bottom: 4px;">${escapeHtml(BRANDING.orgName)}</h2>
      <p style="color: #888; font-size: 13px; margin-top: 0;">${escapeHtml(BRANDING.productName)}</p>
      ${innerHtml}
      <p style="color: #888; font-size: 12px; margin-top: 28px;">Questions? Reply to this email or contact ${escapeHtml(BRANDING.adminEmails[0])}.</p>
    </div>
  `;
}

function ctaButton(label: string, href: string): string {
  return `
    <p style="margin: 22px 0;">
      <a href="${href}" style="display: inline-block; background: ${BRANDING.colors.accent}; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600;">${escapeHtml(label)}</a>
    </p>
  `;
}

function firstName(full: string | null | undefined): string {
  if (!full) return '';
  return String(full).split(/\s+/)[0] || '';
}

function escapeHtml(s: string | null | undefined): string {
  return String(s ?? '').replace(/[<>&"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] as string)
  );
}

// ------- Templates -------

export async function sendSetupLink(opts: { to: string; name?: string; token: string }) {
  const url = `${baseUrl()}/portal/setup/${encodeURIComponent(opts.token)}`;
  const fn = firstName(opts.name);
  const greeting = fn ? `Hello ${fn},` : 'Hello,';
  return send({
    to: opts.to,
    subject: `Your investor portal for ${BRANDING.orgShortName} is ready`,
    html: shell(`
      <p>${greeting}</p>
      <p>Your investor portal for ${escapeHtml(BRANDING.orgName)} is ready. Click below to choose a password and sign in.</p>
      ${ctaButton('Choose your password', url)}
      <p style="font-size: 13px; color: #666;">This link is single-use. After you set your password, sign in going forward at <a href="${baseUrl()}/portal" style="color:${BRANDING.colors.accent};">${baseUrl().replace(/^https?:\/\//, '')}/portal</a>.</p>
    `),
    text: `${greeting}\n\nYour investor portal for ${BRANDING.orgName} is ready. Open this link to choose a password:\n\n${url}\n\nAfter that, sign in at ${baseUrl()}/portal with your email and password.`,
  });
}

export async function sendResetLink(opts: { to: string; name?: string; token: string }) {
  const url = `${baseUrl()}/portal/reset/${encodeURIComponent(opts.token)}`;
  const fn = firstName(opts.name);
  const greeting = fn ? `Hello ${fn},` : 'Hello,';
  return send({
    to: opts.to,
    subject: `Reset your ${BRANDING.orgShortName} investor portal password`,
    html: shell(`
      <p>${greeting}</p>
      <p>We received a request to reset your password. Click below to choose a new one.</p>
      ${ctaButton('Reset your password', url)}
      <p style="font-size: 13px; color: #666;">If you didn't request this, you can safely ignore this email.</p>
    `),
    text: `${greeting}\n\nWe received a request to reset your password. Open this link to choose a new one:\n\n${url}\n\nIf you didn't request this, ignore this email.`,
  });
}

export async function sendEnvelopeInvite(opts: {
  to: string;
  recipientName?: string;
  envelopeTitle?: string;
  senderName?: string;
  envelopeId: string;
  token: string;
  bcc?: string[];
}) {
  const url = `${baseUrl()}/portal/sign/${encodeURIComponent(opts.envelopeId)}/${encodeURIComponent(opts.token)}`;
  const fn = firstName(opts.recipientName);
  const greeting = fn ? `Hello ${fn},` : 'Hello,';
  const who = opts.senderName || BRANDING.orgShortName;
  const title = opts.envelopeTitle || 'a document';
  return send({
    to: opts.to,
    bcc: opts.bcc,
    subject: `${who} requested your signature on "${title}"`,
    html: shell(`
      <p>${greeting}</p>
      <p><strong>${escapeHtml(who)}</strong> has requested your signature on <strong>${escapeHtml(title)}</strong>.</p>
      ${ctaButton('Review and sign', url)}
      <p style="font-size: 13px; color: #666;">This link is single-use.</p>
    `),
    text: `${greeting}\n\n${who} has requested your signature on "${title}". Open this link to sign:\n\n${url}\n\nThis link is single-use.`,
  });
}

export async function sendEnvelopeExecutedCopy(opts: {
  to: string | string[];
  envelopeTitle?: string;
  pdfBytes?: Buffer | Uint8Array;
  pdfFilename?: string;
  bcc?: string[];
}) {
  const title = opts.envelopeTitle || 'document';
  const attachments: Attachment[] | undefined = opts.pdfBytes
    ? [
        {
          filename: opts.pdfFilename || 'executed.pdf',
          content: Buffer.from(opts.pdfBytes).toString('base64'),
        },
      ]
    : undefined;
  return send({
    to: opts.to,
    bcc: opts.bcc,
    subject: `Fully executed: ${title}`,
    html: shell(`
      <p>Hello,</p>
      <p>Attached is the fully-executed copy of <strong>${escapeHtml(title)}</strong>.</p>
      ${ctaButton('Open your portal', `${baseUrl()}/portal`)}
    `),
    text: `Attached is the fully-executed copy of "${title}".\n\nPortal: ${baseUrl()}/portal`,
    attachments,
  });
}
