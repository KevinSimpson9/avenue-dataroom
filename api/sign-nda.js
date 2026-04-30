// /api/sign-nda - Records a signed NDA: validates form, generates PDF, saves to Drive,
// emails investor + Kevin, issues session cookie
import crypto from 'crypto';
import { Readable } from 'stream';
import { google } from 'googleapis';
import { buildSignedNdaPdf } from './_nda-content.js';

async function sendNdaEmail({ to, bcc, password, reference, investorName, pdfBytes, pdfFilename }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: 'RESEND_API_KEY not configured' };

  const from = process.env.RESEND_FROM_EMAIL || 'The Avenue <onboarding@resend.dev>';
  const subject = 'The Avenue at Fountain Hills — Data Room Access';
  const greeting = investorName ? `Hello ${investorName.split(' ')[0]},` : 'Hello,';
  const html = `
    <div style="font-family: -apple-system, system-ui, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1a1816; line-height: 1.55;">
      <h2 style="font-family: Georgia, serif; color: #2A6068; margin-bottom: 4px;">The Avenue at Fountain Hills</h2>
      <p style="color: #888; font-size: 13px; margin-top: 0;">Investor Data Room</p>
      <p>${greeting}</p>
      <p>Thank you for signing the Mutual Non-Disclosure Agreement. A signed PDF copy is attached for your records.</p>
      <p>Your access password to the investor data room:</p>
      <div style="background: #F5EFE6; border-left: 4px solid #D4A24A; padding: 16px 20px; margin: 18px 0; font-family: monospace; font-size: 18px; letter-spacing: 1px;">
        ${password}
      </div>
      <p>Visit <a href="https://dataroom.theavenuefh.com" style="color:#2A6068;">dataroom.theavenuefh.com</a> and enter this password to view the deck and supporting documents.</p>
      <p style="color: #888; font-size: 12px; margin-top: 28px;">Reference: ${reference}<br>If you have any questions, reply to this email or contact Kevin Simpson directly at Kevin@AKCapital.fund.</p>
    </div>
  `;
  const text = `${greeting}\n\nThank you for signing the Mutual Non-Disclosure Agreement. A signed PDF copy is attached for your records.\n\nYour access password: ${password}\n\nVisit https://dataroom.theavenuefh.com and enter this password to view the deck and supporting documents.\n\nReference: ${reference}\nQuestions? Contact Kevin@AKCapital.fund.`;

  const replyTo = process.env.RESEND_REPLY_TO || 'Kevin@AKCapital.fund';
  const payload = {
    from,
    to: [to],
    bcc: bcc ? [bcc] : undefined,
    reply_to: replyTo,
    subject,
    html,
    text,
    attachments: pdfBytes ? [{
      filename: pdfFilename,
      content: Buffer.from(pdfBytes).toString('base64')
    }] : undefined
  };

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const errBody = await res.text();
      return { sent: false, reason: `Resend ${res.status}: ${errBody.slice(0, 200)}` };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

export const config = {
  api: {
    bodyParser: { sizeLimit: '256kb' }
  }
};

function clean(value, max = 200) {
  return String(value || '').trim().slice(0, max);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  const body = req.body || {};
  const formData = {
    name: clean(body.name, 120),
    email: clean(body.email, 200),
    entity: clean(body.entity, 200),
    title: clean(body.title, 120),
    address: clean(body.address, 300),
    phone: clean(body.phone, 60),
    typedSignature: clean(body.typedSignature, 120),
    agreed: !!body.agreed,
  };

  // Validation
  if (!formData.name) return res.status(400).json({ ok: false, message: 'Full legal name is required.' });
  if (!isValidEmail(formData.email)) return res.status(400).json({ ok: false, message: 'A valid email address is required.' });
  if (!formData.address) return res.status(400).json({ ok: false, message: 'Mailing address is required.' });
  if (!formData.agreed) return res.status(400).json({ ok: false, message: 'You must agree to the NDA terms.' });
  if (!formData.typedSignature) return res.status(400).json({ ok: false, message: 'Typed signature is required.' });
  if (formData.typedSignature.toLowerCase() !== formData.name.toLowerCase()) {
    return res.status(400).json({ ok: false, message: 'Typed signature must match your full legal name.' });
  }

  // Server config
  const sessionSecret = process.env.SESSION_SECRET;
  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const ndaFolderId = process.env.GOOGLE_DRIVE_NDA_FOLDER_ID;

  if (!sessionSecret || !serviceAccountKey || !ndaFolderId) {
    return res.status(500).json({ ok: false, message: 'Server not configured. Contact Kevin@AKCapital.fund.' });
  }

  // Audit metadata
  const now = new Date();
  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown';
  const userAgent = req.headers['user-agent'] || '';
  const dateLabel = now.toISOString().slice(0, 10);
  const timestampIso = now.toISOString();
  const safeNameForFile = formData.name.replace(/[^A-Za-z0-9 _-]+/g, '').replace(/\s+/g, '_').slice(0, 60) || 'investor';
  const filename = `${dateLabel}__${safeNameForFile}__The_Avenue_NDA.pdf`;

  // Document hash (deterministic on form contents)
  const docHash = crypto
    .createHash('sha256')
    .update(JSON.stringify({ ...formData, timestampIso, ip }))
    .digest('hex')
    .slice(0, 16);

  try {
    // Generate PDF
    const pdfBytes = await buildSignedNdaPdf(formData, { dateLabel, timestampIso, ip, userAgent, docHash });

    // Upload to Drive
    const credentials = JSON.parse(serviceAccountKey);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.file']
    });
    const drive = google.drive({ version: 'v3', auth });

    await drive.files.create({
      requestBody: {
        name: filename,
        parents: [ndaFolderId],
        description: `Signed by ${formData.name} <${formData.email}> on ${timestampIso} from ${ip}. Entity: ${formData.entity || '—'}.`
      },
      media: {
        mimeType: 'application/pdf',
        body: Readable.from(Buffer.from(pdfBytes))
      },
      fields: 'id, name',
      supportsAllDrives: true
    });

    // Send confirmation email with password + signed PDF (best-effort; failures don't block signing)
    const password = process.env.DATA_ROOM_PASSWORD || '';
    const emailResult = await sendNdaEmail({
      to: formData.email,
      bcc: process.env.NDA_NOTIFY_EMAIL || 'Kevin@AKCapital.fund',
      password,
      reference: docHash,
      investorName: formData.name,
      pdfBytes,
      pdfFilename: filename
    });
    if (!emailResult.sent) {
      console.warn('NDA email not sent:', emailResult.reason);
    }

    // Issue session cookie (7-day expiry, same format as unlock.js)
    const expires = Date.now() + (1000 * 60 * 60 * 24 * 7);
    const signature = crypto
      .createHmac('sha256', sessionSecret)
      .update(String(expires))
      .digest('base64');
    const cookieValue = `${expires}.${signature}`;

    res.setHeader('Set-Cookie', `avenue_session=${cookieValue}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`);
    return res.status(200).json({
      ok: true,
      message: 'NDA recorded.',
      signedAt: timestampIso,
      reference: docHash,
      password,
      emailSent: emailResult.sent
    });
  } catch (err) {
    console.error('sign-nda error:', err);
    return res.status(500).json({
      ok: false,
      message: 'Could not save NDA. Please try again, or contact Kevin@AKCapital.fund directly.'
    });
  }
}
