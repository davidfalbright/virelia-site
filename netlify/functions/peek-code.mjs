// netlify/functions/peek-code.mjs
import { getStore } from '@netlify/blobs';

export async function handler(event) {
  const email = (event.queryStringParameters?.email || '').trim().toLowerCase();
  if (!email) return resp(400, { error: 'missing email' });

  try {
    const store = getStore('email_codes'); // prod context auto-injected
    const raw = await store.get(email);
    return resp(200, { key: email, value: raw ? JSON.parse(raw) : null });
  } catch (err) {
    return resp(500, { error: err.message });
  }
}

function resp(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) };
}
