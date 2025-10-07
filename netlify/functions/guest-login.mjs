// netlify/functions/guest-login.mjs
import crypto from 'node:crypto';

const json = (status, body, cookie) => ({
  statusCode: status,
  headers: {
    'Content-Type': 'application/json',
    ...(cookie ? { 'Set-Cookie': cookie } : {})
  },
  body: JSON.stringify(body),
});

const b64url = (b) =>
  Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

const sign = (payload, secret) => {
  const h = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest());
  return `${h}.${p}.${sig}`;
};

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method Not Allowed' });

  const SECRET = process.env.SESSION_SIGNING_SECRET || process.env.CODE_SIGNING_SECRET;
  if (!SECRET) return json(500, { ok: false, error: 'Server not configured' });

  const now = Date.now();
  const token = sign(
    { sub: 'guest', role: 'guest', iat: now, exp: now + 60 * 60 * 1000 }, // 1h
    SECRET
  );

  const cookie = `session_token=${encodeURIComponent(token)}; Path=/; Max-Age=3600; SameSite=Lax; Secure`;
  return json(200, { ok: true, sessionToken: token }, cookie);
};
