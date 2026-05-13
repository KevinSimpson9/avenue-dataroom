// Auth primitives for the Investor Portal:
//   - scrypt password hashing / verification
//   - HMAC-signed magic-link tokens (setup + reset) with no time expiry
//     (single-use enforced downstream via state, not token expiry)
//   - HMAC-signed session cookie `avenue_portal_session` (7-day expiry)
//   - role-aware request guards
import crypto from 'crypto';

const SESSION_COOKIE = 'avenue_portal_session';
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 days

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET not configured');
  return s;
}

// ---------- Password hashing ----------

export function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(plain), salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(plain, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hashHex] = parts;
  let candidate;
  try {
    candidate = crypto.scryptSync(String(plain), salt, 64, { N: 16384, r: 8, p: 1 });
  } catch {
    return false;
  }
  const expected = Buffer.from(hashHex, 'hex');
  if (candidate.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

// ---------- Magic-link tokens ----------
// Payload: <b64url(email)>.<purpose>.<nonce>.<sig>
// sig = HMAC-SHA256( b64url(email) + '.' + purpose + '.' + nonce ) base64url
// No time expiry; single-use enforced at the use site (setup checks passwordHash;
// reset checks nonce equality vs registry's stored resetNonce, which gets rotated).

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}

function signToken(emailB64, purpose, nonce) {
  return b64url(
    crypto.createHmac('sha256', secret())
      .update(`${emailB64}.${purpose}.${nonce}`)
      .digest()
  );
}

export function issueToken({ email, purpose, nonce }) {
  const emailB64 = b64url(String(email).toLowerCase().trim());
  const n = nonce || crypto.randomBytes(8).toString('hex');
  const sig = signToken(emailB64, purpose, n);
  return `${emailB64}.${purpose}.${n}.${sig}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [emailB64, purpose, nonce, sig] = parts;
  const expected = signToken(emailB64, purpose, nonce);
  let ok = false;
  try {
    ok = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return null;
  }
  if (!ok) return null;
  let email;
  try {
    email = b64urlDecode(emailB64).toString('utf8');
  } catch {
    return null;
  }
  return { email, purpose, nonce };
}

// ---------- Session cookie ----------
// Format: <b64url(email)>.<role>.<expiresMs>.<sig>

function signSession(emailB64, role, expires) {
  return b64url(
    crypto.createHmac('sha256', secret())
      .update(`${emailB64}.${role}.${expires}`)
      .digest()
  );
}

export function buildSessionCookieValue({ email, role }) {
  const emailB64 = b64url(String(email).toLowerCase().trim());
  const expires = Date.now() + SESSION_MAX_AGE_SEC * 1000;
  const sig = signSession(emailB64, role, expires);
  return `${emailB64}.${role}.${expires}.${sig}`;
}

export function setSessionCookie(res, { email, role }) {
  const value = buildSessionCookieValue({ email, role });
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SEC}`
  );
}

export function clearSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
  );
}

export function verifyPortalSession(req) {
  const cookieHeader = req.headers.cookie || '';
  const m = cookieHeader.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  if (!m) return null;
  const parts = m[1].split('.');
  if (parts.length !== 4) return null;
  const [emailB64, role, expiresStr, sig] = parts;
  if (!['investor', 'admin'].includes(role)) return null;
  const expires = parseInt(expiresStr, 10);
  if (!Number.isFinite(expires) || Date.now() > expires) return null;
  const expected = signSession(emailB64, role, expires);
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  let email;
  try {
    email = b64urlDecode(emailB64).toString('utf8');
  } catch {
    return null;
  }
  return { email, role, expires };
}

// ---------- Role guards ----------

// Returns the session if it matches role; otherwise sends an appropriate
// response (302 to / for HTML, 401 JSON for API) and returns null.
export function requireRole(req, res, role, { html = false } = {}) {
  const session = verifyPortalSession(req);
  if (!session || session.role !== role) {
    if (html) {
      res.writeHead(302, { Location: '/' });
      res.end();
    } else {
      res.status(401).json({ ok: false, message: 'Unauthorized' });
    }
    return null;
  }
  return session;
}

export function requireInvestor(req, res, opts) { return requireRole(req, res, 'investor', opts); }
export function requireAdmin(req, res, opts) { return requireRole(req, res, 'admin', opts); }
