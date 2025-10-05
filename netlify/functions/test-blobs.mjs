// netlify/functions/test-blobs.mjs
import { getStore } from '@netlify/blobs';

export async function handler() {
  try {
    // Create (or open) the "email_codes" store.
    // In production, Netlify injects the needed context automatically.
    // When running locally with `netlify dev`, you can also provide siteID/token.
    const emailCodes = getStore({
      name: 'email_codes',
      // These are optional in production; useful locally if needed
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_BLOBS_TOKEN,
    });

    // Write a simple healthcheck record, then read it back.
    const payload = { ok: true, ts: Date.now() };
    await emailCodes.set('healthcheck', JSON.stringify(payload));
    const roundTrip = await emailCodes.get('healthcheck');

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({
        ok: true,
        message: 'Blobs store seeded',
        store: 'email_codes',
        wrote_key: 'healthcheck',
        value: JSON.parse(roundTrip),
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({
        ok: false,
        error: error.message,
        hint:
          'If this fails locally, ensure NETLIFY_SITE_ID and NETLIFY_BLOBS_TOKEN are set. In production, simply call this once.',
      }),
    };
  }
}
