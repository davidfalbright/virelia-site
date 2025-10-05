// netlify/functions/create-credentials.js
import crypto from 'crypto';
import { getStore } from '@netlify/blobs';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });
  try {
    const { email, username, password } = JSON.parse(event.body || '{}');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: 'Invalid email' });
    if (!/^[a-zA-Z0-9._-]{3,20}$/.test(username || '')) return json(400, { error: 'Invalid username' });
    if ((password||'').length < 8) return json(400, { error: 'Password too short' });

    const keyEmail = email.toLowerCase();
    const verified = getStore({ name: 'verified_emails' });
    const status = JSON.parse((await verified.get(keyEmail)) || 'null');
    if (!status || !status.verified || !status.confirmed) return json(403, { error: 'Email not fully verified/confirmed' });

    const users = getStore({ name: 'users' });
    const emailIndex = getStore({ name: 'email_index' });

    // email must not already have creds
    const existingU = await emailIndex.get(keyEmail);
    if (existingU) return json(409, { error: 'Email already has credentials' });

    const uname = String(username).toLowerCase();
    const exists = await users.get(uname);
    if (exists) return json(409, { error: 'Username already taken' });

    const salt = crypto.randomBytes(16).toString('hex');
    const pwdHex = await scryptHex(password, salt);

    const record = {
      username: uname,
      email: keyEmail,
      pwd_scrypt_hex: pwdHex,
      salt_hex: salt,
      created_at: new Date().toISOString()
    };

    await users.set(uname, JSON.stringify(record));
    await emailIndex.set(keyEmail, uname);

    return json(200, { ok: true, username: uname, email: keyEmail });
  } catch {
    return json(500, { error: 'Unexpected server error' });
  }
};

// helpers
function json(statusCode,obj){ return { statusCode, headers:{'Content-Type':'application/json','Cache-Control':'no-store'}, body: JSON.stringify(obj)}; }
async function scryptHex(password, saltHex){ const salt=Buffer.from(saltHex,'hex'); const key=await new Promise((res,rej)=> crypto.scrypt(password, salt, 64, { N:16384, r:8, p:1 }, (e,k)=> e?rej(e):res(k))); return key.toString('hex'); }
