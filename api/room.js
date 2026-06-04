// /api/room - The deal is closed to the public. Behaviour depends on who's asking:
//   - A portal ADMIN (signed into the investor portal) sees the full document room.
//   - Anyone who unlocked the gate with the data-room password sees the closed page.
//   - Everyone else is sent back to the gate.
import { verifySession } from './_auth.js';
import { verifyPortalSession } from './_portal-auth.js';
import fs from 'fs';
import path from 'path';

function serve(res, filename) {
  const filePath = path.join(process.cwd(), 'public', filename);
  const content = fs.readFileSync(filePath, 'utf-8');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).send(content);
}

export default function handler(req, res) {
  const portal = verifyPortalSession(req);
  if (portal && portal.role === 'admin') {
    return serve(res, 'room.html');
  }
  if (verifySession(req)) {
    return serve(res, 'closed.html');
  }
  res.writeHead(302, { Location: '/' });
  return res.end();
}
