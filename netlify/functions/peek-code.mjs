// netlify/functions/peek-code.mjs
import { getStore } from "@netlify/blobs";

function blobsStore(name) {
  if (process.env.NETLIFY_BLOBS_TOKEN && process.env.NETLIFY_SITE_ID) {
    return getStore(name, { siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_BLOBS_TOKEN });
  }
  return getStore(name);
}
const json = (s, b) => ({ statusCode: s, headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });

export const handler = async (event) => {
  try {
    const email = (event.queryStringParameters?.email || "").trim().toLowerCase();
    if (!email) return json(400, { error: "Missing email" });
    const store = blobsStore("email_codes");
    const value = await store.get(email, { type: "json" });
    return json(200, { email, value });
  } catch (err) {
    return json(500, { error: err?.message || String(err) });
  }
};
