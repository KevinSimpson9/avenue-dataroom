// /api/file - Returns Google Drive share URL for a given document key
// Drive file IDs are stored as environment variables on Vercel
import { verifySession } from './_auth.js';

const DOC_MAP = {
  'deck':         'DRIVE_FILE_DECK',
  'promissory':   'DRIVE_FILE_PROMISSORY',
  'appraisal':    'DRIVE_FILE_APPRAISAL',
  'casa':         'DRIVE_FILE_CASA',
  'approvals':    'DRIVE_FILE_APPROVALS',
  'budget':       'DRIVE_FILE_BUDGET',
  'plans':        'DRIVE_FILE_PLANS',
  'reservation':  'DRIVE_FILE_RESERVATION',
  'track-record': 'DRIVE_FILE_TRACK_RECORD'
};

export default function handler(req, res) {
  if (!verifySession(req)) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }

  const docKey = req.query.doc;
  const envVar = DOC_MAP[docKey];

  if (!envVar) {
    return res.status(404).json({ ok: false, message: 'Unknown document.' });
  }

  const fileId = process.env[envVar];
  if (!fileId) {
    return res.status(404).json({
      ok: false,
      message: 'Document not yet uploaded. Contact Kevin@AKCapital.fund for access.'
    });
  }

  // Return Drive viewer URL (works for any file that's shared "anyone with link")
  const url = `https://drive.google.com/file/d/${fileId}/view`;
  return res.status(200).json({ ok: true, url });
}
