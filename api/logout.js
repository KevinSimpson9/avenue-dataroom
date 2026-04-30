// /api/logout - Clear session cookie

export default function handler(req, res) {
  res.setHeader('Set-Cookie', 'avenue_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
  res.writeHead(302, { Location: '/' });
  res.end();
}
