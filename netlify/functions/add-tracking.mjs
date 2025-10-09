import { getStore } from "@netlify/blobs";

const siteID = process.env.NETLIFY_SITE_ID;
const token  = process.env.NETLIFY_BLOBS_TOKEN;
const STORE_NAME = "website_infra";

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method Not Allowed" });
  }
  try {
    const store = getStore({ name: STORE_NAME, siteID, token });
    const body = JSON.parse(event.body);
    const key = `record_${Date.now()}`;
    await store.put(key, JSON.stringify({ ...body, createdAt: Date.now() }));
    return json(200, { ok: true, key });
  } catch (err) {
    console.error(err);
    return json(500, { error: "Failed to add record" });
  }
};

function json(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
