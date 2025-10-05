// netlify/functions/test-blobs.mjs
import { getStore } from "@netlify/blobs";

function blobsStore(name) {
  if (process.env.NETLIFY_BLOBS_TOKEN && process.env.NETLIFY_SITE_ID) {
    return getStore(name, { siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_BLOBS_TOKEN });
  }
  return getStore(name);
}
const json = (s, b) => ({ statusCode: s, headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });

export const handler = async () => {
  try {
    const store = blobsStore("email_codes");
    const payload = { ok: true, ts: Date.now() };
    await store.set("healthcheck", JSON.stringify(payload));
    const roundTrip = await store.get("healthcheck");
    return json(200, { ok: true, wrote: payload, read: JSON.parse(roundTrip) });
  } catch (err) {
    return json(500, { ok: false, error: err?.message || String(err) });
  }
};
