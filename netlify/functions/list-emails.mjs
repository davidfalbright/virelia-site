// netlify/functions/list-emails.mjs
import { getStore } from "@netlify/blobs";

const siteID = process.env.NETLIFY_SITE_ID;
const token  = process.env.NETLIFY_BLOBS_TOKEN;

// Which stores to scan for email keys
const DEFAULT_STORES = [
  "user_credentials",
  "email_status",
  "verified_emails",
  "email_codes",
  "email_index",
];

export const handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method Not Allowed" });
  }

  try {
    const qp = event.queryStringParameters || {};
    const stores =
      (qp.stores ? qp.stores.split(",") : DEFAULT_STORES).map((s) => s.trim()).filter(Boolean);

    const seen = new Set();

    for (const name of stores) {
      try {
        const store = getStore({ name, siteID, token });
        const listing = await store.list();            // Netlify Blobs list
        const blobs = Array.isArray(listing) ? listing : (listing?.blobs || []);

        for (const b of blobs) {
          const key = (b?.key ?? b)?.toString();
          if (!key) continue;
          if (key.includes("@")) seen.add(key);
        }
      } catch {
        // store might not exist yet — ignore
      }
    }

    const emails = Array.from(seen).sort();
    return json(200, { ok: true, emails });
  } catch (e) {
    console.error("list-emails error:", e);
    return json(500, { error: "Unexpected server error" });
  }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}
