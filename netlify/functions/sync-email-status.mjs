// netlify/functions/sync-email-status.mjs
import { getStore } from "@netlify/blobs";

export const handler = async (event) => {
  try {
    const email = (event.queryStringParameters || {}).email || "";
    const key = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) {
      return json(400, { ok:false, error: "Provide ?email=<address>" });
    }

    const verified = getStore({ name: "verified_emails" });
    const status   = getStore({ name: "email_status" });

    const vBefore = safeJSON(await verified.get(key)) || {};
    const s = safeJSON(await status.get(key)) || {};

    const vAfter = {
      ...vBefore,
      verified: !!vBefore.verified,             // keep whatever was set
      confirmed: vBefore.confirmed || !!s.confirmedAt,
      updatedAt: Date.now(),
    };

    await verified.set(key, JSON.stringify(vAfter));

    return json(200, { ok:true, email:key, before:vBefore, after:vAfter });
  } catch (e) {
    console.error("sync-email-status error:", e);
    return json(500, { ok:false, error:"Unexpected server error" });
  }
};

function json(statusCode, body) {
  return { statusCode, headers: { "Content-Type":"application/json", "Cache-Control":"no-store" }, body: JSON.stringify(body) };
}
function safeJSON(s){ try { return JSON.parse(s); } catch { return null; } }
