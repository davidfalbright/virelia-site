import { getStore } from "@netlify/blobs";

const siteID = process.env.NETLIFY_SITE_ID;
const token = process.env.NETLIFY_BLOBS_TOKEN;
const STORE_NAME = "website_infra";

export const handler = async (event) => {
  try {
    const store = getStore({ name: STORE_NAME, siteID, token });
    const listing = await store.list();
    const blobs = Array.isArray(listing) ? listing : (listing?.blobs || []);
    const records = [];

    for (const b of blobs) {
      const key = b?.key ?? b;
      const val = await store.get(key);
      records.push(JSON.parse(val));
    }
    return json(200, { ok: true, records });
  } catch (err) {
    return json(500, { ok: false, error: err.message });
  }
};

function json(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
