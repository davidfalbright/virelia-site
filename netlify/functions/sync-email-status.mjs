// netlify/functions/sync-email-status.mjs
// Reconciles verified state between "verified_emails" and "email_status".
// Works with GET ?email=... or POST { email }.

import { getStore } from "@netlify/blobs";

/* ---------------- helpers ---------------- */
const json = (status, body) => ({
  statusCode: status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});
const ok  = (b = {}) => json(200, { ok: true,  ...b });
const bad = (s = 400, b = {}) => json(s,     { ok: false, ...b });

const looksLikeEmail = (s = "") => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
const safeJSON = (s) => { try { return JSON.parse(s); } catch { return null; } };

// Ensure we always pass explicit credentials to Blobs
function store(name) {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN;
  if (!siteID || !token) {
    throw new Error(
      `Blobs not configured: missing ${!siteID ? "NETLIFY_SITE_ID" : ""}${!siteID && !token ? " and " : ""}${!token ? "NETLIFY_BLOBS_TOKEN" : ""}`
    );
  }
  return getStore({ name, siteID, token });
}

/* ---------------- handler ---------------- */
export const handler = async (event) => {
  try {
    const qpEmail   = (event.queryStringParameters || {}).email || "";
    const bodyEmail = safeJSON(event.body || "")?.email || "";
    const email     = (qpEmail || bodyEmail || "").trim().toLowerCase();

    if (!looksLikeEmail(email)) {
      return bad(400, { error: "Provide ?email=<address> or POST { email }" });
    }

    const verified = store("verified_emails");
    const status   = store("email_status");

    // Load both records (tolerate missing)
    const vBefore = safeJSON(await verified.get(email)) || {};
    const s       = safeJSON(await status.get(email))   || {};

    // Merge logic: booleans and timestamps
    const vAfter = {
      ...vBefore,
      verified   : (vBefore.verified  ?? false) || !!s.verified  || !!s.verifiedAt,
      confirmed  : (vBefore.confirmed ?? false) || !!s.confirmed || !!s.confirmedAt,
      verifiedAt : vBefore.verifiedAt  || s.verifiedAt  || (vBefore.verified ? Date.now() : undefined),
      confirmedAt: vBefore.confirmed   || s.confirmed   ? (vBefore.confirmedAt || s.confirmedAt || Date.now()) : vBefore.confirmedAt,
      updatedAt  : Date.now(),
    };

    await verified.set(email, JSON.stringify(vAfter));

    // Optionally keep legacy store shaped with timestamps
    const sAfter = {
      ...s,
      verifiedAt : vAfter.verified  ? (s.verifiedAt  || vAfter.verifiedAt  || Date.now()) : s.verifiedAt,
      confirmedAt: vAfter.confirmed ? (s.confirmedAt || vAfter.confirmedAt || Date.now()) : s.confirmedAt,
      updatedAt  : Date.now(),
    };
    await status.set(email, JSON.stringify(sAfter));

    return ok({
      email,
      verified: !!vAfter.verified,
      confirmed: !!vAfter.confirmed,
      verifiedStore: vAfter,
      statusStore: sAfter,
    });
  } catch (e) {
    console.error("sync-email-status error:", e);
    // If the environment is the problem, surface it clearly
    const msg = /Blobs not configured/i.test(String(e?.message))
      ? e.message
      : "Unexpected server error";
    return json(500, { ok: false, error: msg });
  }
};
