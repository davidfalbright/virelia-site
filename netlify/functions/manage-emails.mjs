// netlify/functions/manage-emails.mjs
import { getStore } from "@netlify/blobs";

const siteID = process.env.NETLIFY_SITE_ID;
const token  = process.env.NETLIFY_BLOBS_TOKEN;

// Remove keys from all of these stores
const ALL_STORES = [
  "user_credentials",
  "email_status",
  "verified_emails",
  "email_codes",
  "email_index",
];

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method Not Allowed" });
  }

  try {
    const { emails } = JSON.parse(event.body || "{}");
    if (!Array.isArray(emails) || emails.length === 0) {
      return json(400, { error: "No emails provided" });
    }

    const keys = emails.map((e) => String(e).trim().toLowerCase()).filter(Boolean);

    for (const name of ALL_STORES) {
      try {
        const store = getStore({ name, siteID, token });
        for (const k of keys) {
          try { await store.delete(k); } catch {}
        }
      } catch {
        // store might not exist — ignore
      }
    }

    return json(200, { ok: true, deleted: keys });
  } catch (e) {
    console.error("delete-emails error:", e);
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
