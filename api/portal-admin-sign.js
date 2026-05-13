// GET /api/portal/admin/sign?email=… — Lukas's signing page for a specific note.
// Requires admin session; the HTML itself checks that the active admin is Lukas.
import fs from 'fs';
import path from 'path';
import { verifyPortalSession } from './_portal-auth.js';

export default function handler(req, res) {
  const session = verifyPortalSession(req);
  if (!session) { res.writeHead(302, { Location: '/' }); return res.end(); }
  if (session.role !== 'admin') { res.writeHead(302, { Location: '/portal' }); return res.end(); }

  const filePath = path.join(process.cwd(), 'public', 'portal-admin-sign.html');
  const content = fs.readFileSync(filePath, 'utf-8');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).send(content);
}
