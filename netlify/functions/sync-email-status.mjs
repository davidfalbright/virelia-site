// netlify/functions/sync-email-status.mjs
// One-off / maintenance function to reconcile verified state between
// the "verified_emails" (booleans) store and the older "email_status" store.

import { getStore } from "@netlify/blobs";

/* ---------------- helpers ---------------- */
const json = (status, body) => ({
  statusCode: status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});

const ok = (body = {}) => json(200, { ok: true, ...body });
const bad = (status = 400, body = {}) => json(status, { ok: false, ...body });

const looksLikeEmail = (s = "") => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
const safeJSON = (str) => {
  try { return JSON.parse(str); } catch { return null; }
};

/* ---------------- handler ---------------- */
export const handler = async (event) => {
  try {
    // GET ?email=... or POST { email }
    const qpEmail = (event.queryStringParameters || {}).email || "";
    const bodyEmail = safeJSON(event.body || "")?.email || "";
    const email = (qpEmail || bodyEmail || "").trim().toLowerCase();

    if (!looksLikeEmail(email)) {
      return bad(400, { error: "Provide ?email=<address>" });
    }

    // Open both stores (env-provided siteID/token are picked up automatically)
    const verified = getStore({ name: "verified_emails" });
    const status   = getStore({ name: "email_status" });

    // Read both sides
    const vBefore = safeJSON(await verified.get(email)) || {};
    const s       = safeJSON(await status.get(email)) || {};

    // Synthesize a single truth for the verified_emails store
    const vAfter = {
      ...vBefore,
      // set booleans if any hint exists either side
      verified   : vBefore.verified   ?? !!s.verified || !!s.verifiedAt,
      confirmed  : vBefore.confirmed  ?? !!s.confirmed || !!s.confirmedAt,
      // carry timestamps forward if present
      verifiedAt : vBefore.verifiedAt  || s.verifiedAt  || (vBefore.verified ? (vBefore.verifiedAt || Date.now()) : undefined),
      confirmedAt: vBefore.confirmedAt || s.confirmedAt || (vBefore.confirmed ? (vBefore.confirmedAt || Date.now()) : undefined),
      updatedAt  : Date.now(),
    };

    // Persist back to the canonical store
    await verified.set(email, JSON.stringify(vAfter));

    // (Optional) also ensure email_status has the timestamp shape for UI that reads it
    const sAfter = {
      ...s,
      verifiedAt : vAfter.verified   ? (s.verifiedAt  || vAfter.verifiedAt  || Date.now()) : s.verifiedAt,
      confirmedAt: vAfter.confirmed  ? (s.confirmedAt || vAfter.confirmedAt || Date.now()) : s.confirmedAt,
      updatedAt  : Date.now(),
    };
    await status.set(email, JSON.stringify(sAfter));

    return ok({
      email,
      verified  : !!vAfter.verified,
      confirmed : !!vAfter.confirmed,
      verifiedStore: vAfter,
      statusStore  : sAfter,
    });
  } catch (e) {
    console.error("sync-email-status error:", e);
    return json(500, { ok: false, error: "Unexpected server error" });
  }
};
