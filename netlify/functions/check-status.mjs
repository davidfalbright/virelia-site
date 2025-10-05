// netlify/functions/check-status.js
import { getStore } from '@netlify/blobs';

export const handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') {
      return ok({}); // CORS preflight, if you ever need it
    }

    if (event.httpMethod === 'GET') {
      // Allow quick browser checks: optional ?email=...
      const email = (event.queryStringParameters?.email || '').trim();
      if (!email) return ok({ ok: true, method: 'GET', message: 'Functions are live' });

      const out = await lookup(email);
      return ok({ ok: true, method: 'GET', ...out });
    }

    if (event.httpMethod === 'POST') {
      const { email } = JSON.parse(event.body || '{}');
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return bad(400, { error: 'Invalid email' });
      }
      const out = await lookup(email);
      return ok({ ok: true, method: 'POST', ...out });
    }

    return bad(405, { error: 'Method Not Allowed' });
  } catch (e) {
    return bad(500, { error: 'Unexpected server error' });
  }
};

async function lookup(email) {
  const key = email.toLowerCase();
  const verified = getStore({ name: 'email_status' });
  const v = JSON.parse((await verified.get(key)) || 'null');

  const emailIndex = getStore({ name: 'email_index' });
  const uname = await emailIndex.get(key);

  return {
    email: key,
    verified: !!(v && v.verified),
    confirmed: !!(v && v.confirmed),
    hasCredentials: !!uname
  };
}

function ok(body) {
  return {
    statusCode: 200,
    headers: cors(),
    body: JSON.stringify(body)
  };
}
function bad(code, body) {
  return {
    statusCode: code,
    headers: cors(),
    body: JSON.stringify(body)
  };
}
function cors() {
  return {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}
