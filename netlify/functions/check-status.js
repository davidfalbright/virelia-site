// netlify/functions/check-status.js
import { getStore } from '@netlify/blobs';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });
  try {
    const { email } = JSON.parse(event.body || '{}');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: 'Invalid email' });

    const key = email.toLowerCase();
    const verified = getStore({ name: 'verified_emails' });
    const v = JSON.parse((await verified.get(key)) || 'null');
    if (!v) return json(200, { verified:false, confirmed:false, hasCredentials:false });

    const emailIndex = getStore({ name: 'email_index' });
    const uname = await emailIndex.get(key);

    return json(200, {
      verified: !!v.verified,
      confirmed: !!v.confirmed,
      hasCredentials: !!uname
    });
  } catch {
    return json(500, { error: 'Unexpected server error' });
  }
};

function json(statusCode,obj){ return { statusCode, headers:{'Content-Type':'application/json','Cache-Control':'no-store'}, body: JSON.stringify(obj)}; }
