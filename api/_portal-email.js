// Resend-powered email templates for the Investor Portal.
//
// All emails use RESEND_API_KEY / RESEND_FROM_EMAIL / RESEND_REPLY_TO.
// PORTAL_BASE_URL defaults to https://dataroom.theavenuefh.com.

function baseUrl() {
  return (process.env.PORTAL_BASE_URL || 'https://dataroom.theavenuefh.com').replace(/\/$/, '');
}

async function send({ to, subject, html, text, bcc, attachments }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: 'RESEND_API_KEY not configured' };
  const from = process.env.RESEND_FROM_EMAIL || 'The Avenue <onboarding@resend.dev>';
  const replyTo = process.env.RESEND_REPLY_TO || 'Kevin@AKCapital.fund';
  const payload = {
    from,
    to: Array.isArray(to) ? to : [to],
    reply_to: replyTo,
    subject,
    html,
    text
  };
  if (bcc) payload.bcc = Array.isArray(bcc) ? bcc : [bcc];
  if (attachments) payload.attachments = attachments;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const body = await res.text();
      return { sent: false, reason: `Resend ${res.status}: ${body.slice(0, 240)}` };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

function shell(innerHtml) {
  return `
    <div style="font-family: -apple-system, system-ui, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1a1816; line-height: 1.55;">
      <h2 style="font-family: Georgia, serif; color: #2A6068; margin-bottom: 4px;">The Avenue at Fountain Hills</h2>
      <p style="color: #888; font-size: 13px; margin-top: 0;">Investor Portal</p>
      ${innerHtml}
      <p style="color: #888; font-size: 12px; margin-top: 28px;">Questions? Reply to this email or contact Kevin@AKCapital.fund.</p>
    </div>
  `;
}

function ctaButton(label, href) {
  return `
    <p style="margin: 22px 0;">
      <a href="${href}" style="display: inline-block; background: #D4A24A; color: #1A1816; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600;">${label}</a>
    </p>
  `;
}

// ---------- 1. Setup link to investor ----------
// Sent when Kevin adds an investor + uploads their blank PDF.
export async function sendSetupLink({ to, name, token }) {
  const url = `${baseUrl()}/portal/setup?token=${encodeURIComponent(token)}`;
  const greeting = name ? `Hello ${name.split(' ')[0]},` : 'Hello,';
  return send({
    to,
    subject: 'Your investor portal for The Avenue is ready',
    html: shell(`
      <p>${greeting}</p>
      <p>Kevin has set up your investor portal for The Avenue at Fountain Hills. Click below to choose a password and sign in.</p>
      ${ctaButton('Choose your password', url)}
      <p style="font-size: 13px; color: #666;">This link is single-use. After you set your password, sign in going forward at <a href="${baseUrl()}" style="color:#2A6068;">${baseUrl().replace('https://', '')}</a> with your email and the password you choose.</p>
    `),
    text: `${greeting}\n\nKevin has set up your investor portal for The Avenue at Fountain Hills. Open this link to choose a password and sign in:\n\n${url}\n\nAfter that, sign in at ${baseUrl()} with your email and password.\n\nQuestions? Reply to this email or contact Kevin@AKCapital.fund.`
  });
}

// ---------- 8. New message from an investor → notify the admin ----------
export async function sendNewMessageToAdmin({ to, investorName, investorEmail, snippet }) {
  const who = investorName || investorEmail || 'An investor';
  const url = `${baseUrl()}/portal/admin?email=${encodeURIComponent(investorEmail || '')}`;
  return send({
    to,
    subject: `New message from ${who}`,
    html: shell(`
      <p>Kevin —</p>
      <p><strong>${escapeHtml(who)}</strong> sent you a message in the investor portal:</p>
      <blockquote style="margin:14px 0;padding:10px 16px;border-left:3px solid #D4A24A;color:#444;">${escapeHtml(snippet || '')}</blockquote>
      ${ctaButton('Open the conversation', url)}
    `),
    text: `Kevin — ${who} sent you a message in the investor portal:\n\n"${snippet || ''}"\n\nReply here: ${url}`
  });
}

// ---------- 9. Admin reply → notify the investor ----------
export async function sendAdminReplyToInvestor({ to, investorName, snippet }) {
  const greeting = investorName ? `Hello ${String(investorName).split(' ')[0]},` : 'Hello,';
  const url = `${baseUrl()}/portal`;
  return send({
    to,
    subject: 'New message from Kevin · The Avenue',
    html: shell(`
      <p>${greeting}</p>
      <p>Kevin replied to you in your investor portal:</p>
      <blockquote style="margin:14px 0;padding:10px 16px;border-left:3px solid #D4A24A;color:#444;">${escapeHtml(snippet || '')}</blockquote>
      ${ctaButton('Open your portal', url)}
    `),
    text: `${greeting}\n\nKevin replied to you in your investor portal:\n\n"${snippet || ''}"\n\nOpen your portal: ${url}`
  });
}

// ---------- 10. New deal update → notify investor(s) ----------
export async function sendUpdateNotice({ to, title, snippet, bcc }) {
  const url = `${baseUrl()}/portal`;
  return send({
    to,
    bcc,
    subject: `New update · The Avenue${title ? ` — ${title}` : ''}`,
    html: shell(`
      <p>Hello,</p>
      <p>There's a new update in your investor portal${title ? `: <strong>${escapeHtml(title)}</strong>` : ''}.</p>
      ${snippet ? `<blockquote style="margin:14px 0;padding:10px 16px;border-left:3px solid #D4A24A;color:#444;">${escapeHtml(snippet)}</blockquote>` : ''}
      ${ctaButton('Read the update', url)}
    `),
    text: `Hello,\n\nThere's a new update in your investor portal${title ? `: ${title}` : ''}.\n\n${snippet || ''}\n\nRead it here: ${url}`
  });
}

// ---------- Helpers ----------
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
}
