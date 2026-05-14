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

// ---------- 2. Lukas notification — new investor added ----------
export async function sendLukasNewNoteNotice({ to, investorName, principal }) {
  const url = `${baseUrl()}/portal/admin/envelopes`;
  const amount = formatMoney(principal);
  return send({
    to,
    subject: `New investor added — ${investorName}`,
    html: shell(`
      <p>Hi Lukas,</p>
      <p>Kevin has added <strong>${investorName}</strong> (${amount}) to the investor portal. When the promissory note is ready, create an envelope, drop the signature fields where they belong, and send it.</p>
      ${ctaButton('Open envelopes', url)}
    `),
    text: `Hi Lukas,\n\nKevin has added ${investorName} (${amount}) to the investor portal. Create a signing envelope when the promissory note is ready:\n\n${url}`
  });
}

// ---------- 3. Investor — your note is ready to counter-sign ----------
// Sent after Lukas signs. If passwordHash is null, this same email IS the setup link.
export async function sendInvestorReadyToSign({ to, name, principal, needsSetup, setupToken }) {
  const amount = formatMoney(principal);
  const greeting = name ? `Hello ${name.split(' ')[0]},` : 'Hello,';
  const url = needsSetup
    ? `${baseUrl()}/portal/setup?token=${encodeURIComponent(setupToken)}`
    : `${baseUrl()}/portal`;
  const label = needsSetup ? 'Set password & sign your note' : 'Review and sign your note';
  return send({
    to,
    subject: 'Your promissory note for The Avenue is ready to sign',
    html: shell(`
      <p>${greeting}</p>
      <p>Lukas Bondy has signed his portion (Debtor and Guarantor) of your <strong>${amount}</strong> promissory note. The document is now ready for your counter-signature as Creditor.</p>
      ${ctaButton(label, url)}
      <p style="font-size: 13px; color: #666;">Once you sign, you'll receive a fully-executed PDF copy by email. Kevin will follow up separately with wire instructions.</p>
    `),
    text: `${greeting}\n\nLukas Bondy has signed his portion of your ${amount} promissory note. Click here to review and counter-sign:\n\n${url}\n\nOnce signed, you'll receive a fully-executed copy. Kevin will send wire instructions separately.`
  });
}

// ---------- 4. Investor — fully executed copy ----------
export async function sendExecutedCopy({ to, name, principal, pdfBytes, pdfFilename, bcc }) {
  const amount = formatMoney(principal);
  const greeting = name ? `Hello ${name.split(' ')[0]},` : 'Hello,';
  return send({
    to,
    subject: 'Your fully-executed promissory note',
    bcc,
    html: shell(`
      <p>${greeting}</p>
      <p>Attached is your fully-executed <strong>${amount}</strong> promissory note for The Avenue at Fountain Hills. Lukas Bondy has signed as Debtor and Guarantor; your counter-signature as Creditor is now on file.</p>
      <p>Kevin will follow up separately with wire instructions. You can also revisit your investor portal anytime to download a copy or upload supporting documents.</p>
      ${ctaButton('Open your portal', `${baseUrl()}/portal`)}
    `),
    text: `${greeting}\n\nAttached is your fully-executed ${amount} promissory note for The Avenue at Fountain Hills.\n\nKevin will follow up separately with wire instructions. You can also revisit your portal anytime at ${baseUrl()}/portal`,
    attachments: pdfBytes ? [{
      filename: pdfFilename,
      content: Buffer.from(pdfBytes).toString('base64')
    }] : undefined
  });
}

// ---------- 5. Kevin — admin notification (investor counter-signed) ----------
export async function sendKevinInvestorSignedNotice({ to, investorName, principal }) {
  const amount = formatMoney(principal);
  return send({
    to,
    subject: `${investorName} signed their promissory note (${amount})`,
    html: shell(`
      <p>Kevin —</p>
      <p><strong>${investorName}</strong> just counter-signed their <strong>${amount}</strong> promissory note. Time to send wire instructions.</p>
      ${ctaButton('Open admin portal', `${baseUrl()}/portal/admin`)}
    `),
    text: `Kevin — ${investorName} just counter-signed their ${amount} promissory note. Time to send wire instructions.\n\nAdmin portal: ${baseUrl()}/portal/admin`
  });
}

// ---------- 6. Generic envelope — invite a recipient to sign ----------
export async function sendEnvelopeInvite({ to, recipientName, envelopeTitle, senderName, token, envelopeId, bcc }) {
  const url = `${baseUrl()}/portal/sign-envelope?id=${encodeURIComponent(envelopeId)}&token=${encodeURIComponent(token)}`;
  const greeting = recipientName ? `Hello ${String(recipientName).split(' ')[0]},` : 'Hello,';
  const who = senderName || 'The Avenue';
  const title = envelopeTitle || 'a document';
  return send({
    to,
    bcc,
    subject: `${who} requested your signature on "${title}"`,
    html: shell(`
      <p>${greeting}</p>
      <p><strong>${escapeHtml(who)}</strong> has requested your signature on <strong>${escapeHtml(title)}</strong>. Click below to review the document and sign.</p>
      ${ctaButton('Review and sign', url)}
      <p style="font-size: 13px; color: #666;">This link is single-use. After you sign, it can't be reused.</p>
    `),
    text: `${greeting}\n\n${who} has requested your signature on "${title}". Click here to review and sign:\n\n${url}\n\nThis link is single-use.`
  });
}

// ---------- 7. Generic envelope — fully executed copy to every recipient ----------
export async function sendEnvelopeExecutedCopy({ to, envelopeTitle, pdfBytes, pdfFilename, bcc }) {
  const title = envelopeTitle || 'document';
  return send({
    to,
    bcc,
    subject: `Fully executed: ${title}`,
    html: shell(`
      <p>Hello,</p>
      <p>Attached is the fully-executed copy of <strong>${escapeHtml(title)}</strong>. All required signatures are now on file.</p>
      ${ctaButton('Open your portal', `${baseUrl()}/portal`)}
    `),
    text: `Attached is the fully-executed copy of "${title}". All required signatures are now on file.\n\nPortal: ${baseUrl()}/portal`,
    attachments: pdfBytes ? [{
      filename: pdfFilename || 'executed.pdf',
      content: Buffer.from(pdfBytes).toString('base64')
    }] : undefined
  });
}

// ---------- Helpers ----------
function formatMoney(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
}
