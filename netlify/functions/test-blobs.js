import { getStore } from '@netlify/blobs';

export async function handler() {
  const store = getStore('test-store');
  await store.set('ping', 'pong');
  const value = await store.get('ping');
  return new Response(JSON.stringify({ ok: true, value }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
