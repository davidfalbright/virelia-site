// netlify/functions/test-blobs.mjs
import { getStore } from '@netlify/blobs';

function json(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}

export async function handler(event) {
  try {
    // In production Netlify injects siteID/token automatically.
    // If you're running locally with `netlify dev` and have the two env vars,
    // we'll use them as a fallback.
    const store =
      process.env.NETLIFY_SITE_ID && process.env.NETLIFY_BLOBS_TOKEN
        ? getStore({
            name: 'email_codes',
            siteID: process.env.NETLIFY_SITE_ID,
            token: process.env.NETLIFY_BLOBS_TOKEN,
          })
        : getStore({ name: 'email_codes' });

    const qs = event.queryStringParameters || {};
    const op = qs.op || 'health';
    const key = qs.key;
    const value = qs.value ?? '';

    if (op === 'write' && key) {
      await store.set(key, value);
      const roundTrip = await store.get(key);
      return json(200, { ok: true, wrote: { key, value: roundTrip } });
    }

    if (op === 'read' && key) {
      const v = await store.get(key);
      return json(200, { ok: true, read: { key, value: v } });
    }

    // Default: health-check
    const payload = { ok: true, ts: Date.now() };
    await store.set('healthcheck', JSON.stringify(payload));
    const roundTrip = await store.get('healthcheck');
    return json(200, { ok: true, mode: 'health', value: JSON.parse(roundTrip) });
  } catch (err) {
    return json(500, { ok: false, error: err.message });
  }
}
