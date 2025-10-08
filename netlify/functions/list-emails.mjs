// netlify/functions/list-emails.mjs
import { getStore } from "@netlify/blobs";

const siteID = process.env.NETLIFY_SITE_ID;
const token = process.env.NETLIFY_BLOBS_TOKEN;

// Which stores to scan for email keys
const DEFAULT_STORES = [
  "email_status",           // Store for email sent statuses
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
    const emailData = {};

    // Fetch data from each store
    for (const name of stores) {
      try {
        const store = getStore({ name, siteID, token });
        const listing = await store.list(); // Netlify Blobs list
        const blobs = Array.isArray(listing) ? listing : (listing?.blobs || []);

        for (const b of blobs) {
          const key = (b?.key ?? b)?.toString();
          if (!key) continue;

          if (key.includes("@")) {
            // Initialize the email data entry if it doesn't already exist
            if (!emailData[key]) {
              emailData[key] = {
                email: key,
                emailSent: false,
                emailSentDate: null,
                codeVerified: false,
                codeVerifiedDate: null,
              };
            }

            // Depending on the store, update the email data
            if (name === "email_status" && b.status === "sent") {
              emailData[key].emailSent = true;
              emailData[key].emailSentDate = b.timestamp || new Date().toISOString();
            }

            if (name === "verified_emails") {
              emailData[key].codeVerified = true;
              emailData[key].codeVerifiedDate = b.timestamp || new Date().toISOString();
            }
          }
        }
      } catch (e) {
        // If a store doesn't exist yet or is unreachable, just skip it
        console.warn(`Store ${name} could not be accessed:`, e);
      }
    }

    // Convert the emailData object to an array of emails with statuses
    const emails = Object.values(emailData).sort((a, b) => a.email.localeCompare(b.email));

    return json(200, { ok: true, emails });
  } catch (e) {
    console.error("list-emails error:", e);
    return json(500, { error: "Unexpected server error" });
  }
};

// Utility function to return a structured JSON response
function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}
