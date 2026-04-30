// /api/room - Serves the protected room page after auth check
import { verifySession } from './_auth.js';
import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  if (!verifySession(req)) {
    res.writeHead(302, { Location: '/' });
    return res.end();
  }

  // Serve room.html
  const filePath = path.join(process.cwd(), 'public', 'room.html');
  const content = fs.readFileSync(filePath, 'utf-8');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).send(content);
}
