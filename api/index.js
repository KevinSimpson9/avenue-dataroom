// /api/index - Serves the gate page, but redirects to /room if the visitor
// already has a valid session cookie (e.g. signed in on another tab).
import { verifySession } from './_auth.js';
import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  if (verifySession(req)) {
    res.writeHead(302, { Location: '/room' });
    return res.end();
  }

  const filePath = path.join(process.cwd(), 'public', 'index.html');
  const content = fs.readFileSync(filePath, 'utf-8');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).send(content);
}
