// /api/upload - Receives file uploads and saves them to Kevin's Google Drive
// Uses a Google service account to authenticate (no OAuth flow needed)
import { verifySession } from './_auth.js';
import { google } from 'googleapis';
import formidable from 'formidable';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false, // We handle the multipart form ourselves
    sizeLimit: '25mb'
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  // Auth check
  if (!verifySession(req)) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }

  // Verify configuration
  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const folderId = process.env.GOOGLE_DRIVE_UPLOAD_FOLDER_ID;

  if (!serviceAccountKey || !folderId) {
    return res.status(500).json({
      ok: false,
      message: 'Upload destination not configured. Contact Kevin@AKCapital.fund directly.'
    });
  }

  try {
    // Parse multipart form data
    const form = formidable({ maxFileSize: 25 * 1024 * 1024 });
    const [fields, files] = await form.parse(req);

    const fileList = Array.isArray(files.file) ? files.file : [files.file].filter(Boolean);
    if (fileList.length === 0) {
      return res.status(400).json({ ok: false, message: 'No file received' });
    }

    // Authenticate with Google
    const credentials = JSON.parse(serviceAccountKey);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.file']
    });
    const drive = google.drive({ version: 'v3', auth });

    // Upload each file
    const uploaded = [];
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    for (const file of fileList) {
      const originalName = file.originalFilename || 'upload';
      const safeName = `${timestamp}__${originalName}`;

      const response = await drive.files.create({
        requestBody: {
          name: safeName,
          parents: [folderId]
        },
        media: {
          mimeType: file.mimetype || 'application/octet-stream',
          body: fs.createReadStream(file.filepath)
        },
        fields: 'id, name, webViewLink'
      });

      uploaded.push({
        id: response.data.id,
        name: response.data.name,
        link: response.data.webViewLink
      });

      // Clean up temp file
      try { fs.unlinkSync(file.filepath); } catch {}
    }

    return res.status(200).json({
      ok: true,
      message: `${uploaded.length} file(s) saved to Drive`,
      uploaded
    });
  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({
      ok: false,
      message: 'Upload failed: ' + (err.message || 'Unknown error')
    });
  }
}
