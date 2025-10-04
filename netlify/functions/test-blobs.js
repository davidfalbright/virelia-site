// netlify/functions/test-blobs.js
import { getStore } from '@netlify/blobs';

export async function handler(event) {
  try {
    // Use environment-aware getStore (Netlify auto-injects site info in production)
    const store = getStore('default', {
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_BLOBS_TOKEN,
    });

    // Test writing and reading data
    await store.set('hello', 'world');
    const value = await store.get('hello');

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        message: 'Blob store test successful',
        stored_value: value,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: error.message,
        note:
          'If running locally, ensure NETLIFY_SITE_ID and NETLIFY_BLOBS_TOKEN are set. In production, enable Blobs in Netlify → Blobs tab.',
      }),
    };
  }
}
