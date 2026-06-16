// Shared helpers for the Jarvis Command Center:
//  - session verification (separate cookie from the data room)
//  - reading jarvis/ state (config, cards, briefings) off the bundled FS
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const COOKIE_NAME = 'jarvis_session';

export function signSession(expires) {
  const secret = process.env.SESSION_SECRET || 'change-me';
  return crypto.createHmac('sha256', secret).update(String(expires)).digest('base64');
}

export function verifyJarvisSession(req) {
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match) return false;

  const [expiresStr, signature] = match[1].split('.');
  if (!expiresStr || !signature) return false;

  const expires = parseInt(expiresStr, 10);
  if (isNaN(expires) || Date.now() > expires) return false;

  const expectedSig = signSession(expiresStr);
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
  } catch {
    return false;
  }
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;

// --- jarvis/ data loading -------------------------------------------------

function jarvisDir() {
  return path.join(process.cwd(), 'jarvis');
}

// Minimal frontmatter parser: splits the leading --- block from the body.
function parseCard(raw, filename) {
  const fm = {};
  let body = raw;
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (m) {
    body = m[2].trim();
    const lines = m[1].split('\n');
    let key = null;
    for (const line of lines) {
      // block scalar continuation (indented) belongs to the previous key
      const kv = line.match(/^([a-zA-Z0-9_]+):\s?(.*)$/);
      if (kv && !line.startsWith(' ')) {
        key = kv[1];
        let val = kv[2];
        if (val === '|' || val === '') { fm[key] = val === '|' ? '' : ''; }
        else { fm[key] = val.replace(/^["']|["']$/g, ''); }
      } else if (key && line.trim()) {
        fm[key] = (fm[key] ? fm[key] + ' ' : '') + line.trim();
      }
    }
  }
  return {
    file: filename,
    id: fm.id || filename.replace(/\.md$/, ''),
    title: fm.title || '(untitled)',
    seat: fm.seat || 'unknown',
    tier: parseInt(fm.tier, 10) || null,
    status: (fm.status || 'pending').trim(),
    created: fm.created || '',
    entity: fm.entity || '',
    why: fm.why || '',
    result: fm.result || '',
    body,
  };
}

export function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(jarvisDir(), 'config.json'), 'utf-8'));
  } catch {
    return null;
  }
}

export function loadCards() {
  const dir = path.join(jarvisDir(), 'cards');
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.md')); } catch { return []; }
  return files
    .map(f => parseCard(fs.readFileSync(path.join(dir, f), 'utf-8'), f))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function loadLatestBriefing() {
  const dir = path.join(jarvisDir(), 'briefings');
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.md')); } catch { return null; }
  if (!files.length) return null;
  files.sort();
  const file = files[files.length - 1];
  return { file, markdown: fs.readFileSync(path.join(dir, file), 'utf-8') };
}
