// netlify/functions/verify-code.js
import crypto from 'crypto';
import { getStore } from '@netlify/blobs';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });
  try {
    const { email, code } = JSON.parse(event.body || '{}');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: 'Invalid email' });
    if (!/^[A-Z]{3}-[A-Z]{3}$/.test((code||'').toUpperCase())) return json(400, { error: 'Invalid code format' });

    const codes = getStore({ name: 'email_codes' });
    const key = email.toLowerCase();
    const rec = JSON.parse((await codes.get(key)) || 'null');
    if (!rec) return json(400, { error: 'No active code' });
    if (Date.now() > rec.exp) return json(400, { error: 'Code expired' });

    const normalized = String(code).toUpperCase();
    const ok = timingSafeHexEq(rec.codeHash, sha256(normalized));
    if (!ok) return json(400, { error: 'Incorrect code' });

    // mark verified
    const verified = getStore({ name: 'verified_emails' });
    const prev = JSON.parse((await verified.get(key)) || '{}');
    const record = {
      email: key,
      verified: true,
      verified_at: new Date().toISOString(),
      confirmed: !!prev.confirmed,
      confirmed_at: prev.confirmed_at || null
    };
    await verified.set(key, JSON.stringify(record));

    // optional: delete the code to prevent reuse
    await codes.delete(key);

    // also tell if the email already has credentials
    const emailIndex = getStore({ name: 'email_index' });
    const uname = await emailIndex.get(key);
    const hasCredentials = !!uname;

    const canCreate = record.verified && record.confirmed && !hasCredentials;
    return json(200, { ok: true, confirmed: record.confirmed, verified: record.verified, hasCredentials, canCreate });
  } catch {
    return json(500, { error: 'Unexpected server error' });
  }
};

// helpers
function sha256(s){ return crypto.createHash('sha256').update(s).digest('hex'); }
function timingSafeHexEq(aHex,bHex){
  const a = Buffer.from(aHex,'hex'), b = Buffer.from(bHex,'hex');
  return a.length===b.length && crypto.timingSafeEqual(a,b);
}
function json(statusCode,obj){ return { statusCode, headers:{'Content-Type':'application/json','Cache-Control':'no-store'}, body: JSON.stringify(obj)}; }
