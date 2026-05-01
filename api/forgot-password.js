// /api/forgot-password - If the email previously signed an NDA, re-send the data room password.
// Otherwise tell the client the email is not registered (frontend redirects to NDA flow).
import { google } from 'googleapis';

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function sendPasswordEmail({ to, password, investorName }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: 'RESEND_API_KEY not configured' };

  const from = process.env.RESEND_FROM_EMAIL || 'The Avenue <onboarding@resend.dev>';
  const replyTo = process.env.RESEND_REPLY_TO || 'Kevin@AKCapital.fund';
  const subject = 'The Avenue at Fountain Hills — Data Room Password';
  const greeting = investorName ? `Hello ${investorName.split(' ')[0]},` : 'Hello,';
  const html = `
    <div style="font-family: -apple-system, system-ui, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1a1816; line-height: 1.55;">
      <h2 style="font-family: Georgia, serif; color: #2A6068; margin-bottom: 4px;">The Avenue at Fountain Hills</h2>
      <p style="color: #888; font-size: 13px; margin-top: 0;">Investor Data Room</p>
      <p>${greeting}</p>
      <p>Per your request, here is the access password to the investor data room:</p>
      <div style="background: #F5EFE6; border-left: 4px solid #D4A24A; padding: 16px 20px; margin: 18px 0; font-family: monospace; font-size: 18px; letter-spacing: 1px;">
        ${password}
      </div>
      <p>Visit <a href="https://dataroom.theavenuefh.com" style="color:#2A6068;">dataroom.theavenuefh.com</a> and enter this password to view the deck and supporting documents.</p>
      <p style="color: #888; font-size: 12px; margin-top: 28px;">If you did not request this, you can ignore this email. Questions? Reply here or contact Kevin Simpson at Kevin@AKCapital.fund.</p>
    </div>
  `;
  const text = `${greeting}\n\nPer your request, here is the access password to the investor data room:\n\n${password}\n\nVisit https://dataroom.theavenuefh.com and enter this password to view the documents.\n\nIf you did not request this, you can ignore this email. Questions? Contact Kevin@AKCapital.fund.`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from, to: [to], reply_to: replyTo, subject, html, text })
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 200);
  if (!isValidEmail(email)) {
    return res.status(400).json({ ok: false, message: 'A valid email address is required.' });
  }

  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const ndaFolderId = process.env.GOOGLE_DRIVE_NDA_FOLDER_ID;
  const password = process.env.DATA_ROOM_PASSWORD || '';
  if (!serviceAccountKey || !ndaFolderId || !password) {
    return res.status(500).json({ ok: false, message: 'Server not configured. Contact Kevin@AKCapital.fund.' });
  }

  // Slow brute-force enumeration of email addresses
  await new Promise(r => setTimeout(r, 600));

  try {
    const credentials = JSON.parse(serviceAccountKey);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.file']
    });
    const drive = google.drive({ version: 'v3', auth });

    // sign-nda.js stores `Signed by <Name> <email@x.com> on ...` in each file's description.
    // fullText search doesn't reliably index PDF descriptions, so list everything in the
    // folder and filter by description in JS. Folder is small (one file per investor).
    const matches = [];
    let pageToken;
    do {
      const list = await drive.files.list({
        q: `'${ndaFolderId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, description, createdTime)',
        pageSize: 200,
        pageToken,
        orderBy: 'createdTime desc',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
      });
      for (const f of (list.data.files || [])) {
        if ((f.description || '').toLowerCase().includes(email)) matches.push(f);
      }
      pageToken = list.data.nextPageToken;
    } while (pageToken);

    if (matches.length === 0) {
      return res.status(200).json({ ok: true, registered: false });
    }

    // Pull the investor name out of the most recent matching file's description for the greeting
    let investorName = '';
    const desc = matches[0].description || '';
    const m = desc.match(/Signed by\s+(.+?)\s+<([^>]+)>/i);
    if (m) investorName = m[1].trim();

    const emailResult = await sendPasswordEmail({ to: email, password, investorName });
    if (!emailResult.sent) {
      console.warn('forgot-password email not sent:', emailResult.reason);
      return res.status(500).json({ ok: false, message: 'Could not send email. Please try again or contact Kevin@AKCapital.fund.' });
    }

    return res.status(200).json({ ok: true, registered: true });
  } catch (err) {
    console.error('forgot-password error:', err);
    return res.status(500).json({ ok: false, message: 'Something went wrong. Please try again or contact Kevin@AKCapital.fund.' });
  }
}
