import { getStore } from "@netlify/blobs";

const siteID = process.env.NETLIFY_SITE_ID;
const token = process.env.NETLIFY_BLOBS_TOKEN;
const STORE_NAME = "website_infra";

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method Not Allowed" });
  }
  try {
    const { website } = JSON.parse(event.body || "{}");
    if (!website) return json(400, { error: "Website required" });
    const store = getStore({ name: STORE_NAME, siteID, token });
    await store.delete(website);
    return json(200, { ok: true });
  } catch (err) {
    return json(500, { ok: false, error: err.message });
  }
};

function json(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
