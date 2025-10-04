// netlify/functions/login.js
import crypto from 'crypto';
import { getStore } from '@netlify/blobs';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  try {
    const { loginId, password } = JSON.parse(event.body || '{}');
    if (!loginId || !password) return json(400, { error: 'Missing loginId or password' });

    const users = getStore({ name: 'users' });
    const emailIndex = getStore({ name: 'email_index' });

    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginId);
    let usernameKey = null;

    if (isEmail) {
      const uname = await emailIndex.get(String(loginId).toLowerCase());
      if (!uname) return json(401, { error: 'Invalid credentials' });
      usernameKey = uname;
    } else {
      usernameKey = String(loginId).toLowerCase();
    }

    const raw = await users.get(usernameKey);
    if (!raw) return json(401, { error: 'Invalid credentials' });

    const user = JSON.parse(raw);
    const { pwd_scrypt_hex, salt_hex, email, username } = user;

    const attemptHex = await scryptHex(password, salt_hex);
    const a = Buffer.from(pwd_scrypt_hex, 'hex');
    const b = Buffer.from(attemptHex, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return json(401, { error: 'Invalid credentials' });

    const SECRET = process.env.SESSION_SIGNING_SECRET || process.env.CODE_SIGNING_SECRET;
    if (!SECRET) return json(500, { error: 'Server not configured' });

    const sessionToken = signToken({
      sub: username,
      email,
      iat: Date.now(),
      exp: Date.now() + (60 * 60 * 1000)
    }, SECRET);

    return json(200, { ok: true, username, email, sessionToken });
  } catch {
    return json(500, { error: 'Unexpected server error' });
  }
};

function json(statusCode,obj){ return { statusCode, headers:{'Content-Type':'application/json','Cache-Control':'no-store'}, body: JSON.stringify(obj)}; }
async function scryptHex(password, saltHex){ const salt=Buffer.from(saltHex,'hex'); const key=await new Promise((res,rej)=> crypto.scrypt(password, salt, 64, { N:16384, r:8, p:1 }, (e,k)=> e?rej(e):res(k))); return key.toString('hex'); }
function b64url(b){ return Buffer.from(b).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function signToken(payload, secret){ const h=b64url(JSON.stringify({alg:'HS256',typ:'JWT'})); const p=b64url(JSON.stringify(payload)); const data=`${h}.${p}`; const sig=crypto.createHmac('sha256', secret).update(data).digest(); return `${data}.${b64url(sig)}`; }
