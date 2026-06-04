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
  // Any signed-in portal user (invited investor or admin) sees the real document
  // room. A bare data-room cookie with no portal session means a member of the
  // public who unlocked the gate — they get the "deal is closed" page.
  if (verifyPortalSession(req)) {
    return serve(res, 'room.html');
  }
  if (verifySession(req)) {
    return serve(res, 'closed.html');
  }
  res.writeHead(302, { Location: '/' });
  return res.end();
}
