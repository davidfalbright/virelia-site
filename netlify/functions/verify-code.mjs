// netlify/functions/verify-code.mjs
import crypto from "crypto";
import { getStore } from "@netlify/blobs";

function json(status, body) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}
function sha256(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}
function blobsStore(name) {
  if (process.env.NETLIFY_BLOBS_TOKEN && process.env.NETLIFY_SITE_ID) {
    return getStore(name, { siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_BLOBS_TOKEN });
  }
  return getStore(name);
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  try {
    const { email, code } = JSON.parse(event.body || "{}");
    const key = (email || "").trim().toLowerCase();
    if (!key || !code) return json(400, { error: "Missing email or code" });

    const codes = blobsStore("email_codes");
    const stored = await codes.get(key, { type: "json" }); // { codeHash, exp, issuedAt, ... }
    if (!stored) return json(400, { error: "No code on record" });
    if (Date.now() > Number(stored.exp || 0)) return json(400, { error: "Code expired" });

    const ok = sha256(String(code).toUpperCase()) === stored.codeHash;
    if (!ok) return json(401, { error: "Invalid code" });

    // Optionally: consume the code by deleting it
    // await codes.delete(key);

    return json(200, { ok: true });
  } catch (err) {
    console.error("verify-code error:", err);
    return json(500, { error: err?.message || "Unexpected server error" });
  }
};
