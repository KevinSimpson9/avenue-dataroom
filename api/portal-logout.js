// GET /api/portal/logout — clear the portal session cookie + redirect to /.
import { clearSessionCookie } from './_portal-auth.js';

export default function handler(req, res) {
  clearSessionCookie(res);
  res.writeHead(302, { Location: '/' });
  return res.end();
}
