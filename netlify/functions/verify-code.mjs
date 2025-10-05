// netlify/functions/verify-code.mjs
import crypto from "crypto";
import { getStore } from "@netlify/blobs";

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  try {
    const { email, code } = JSON.parse(event.body || "{}");
    if (!email || !code) return json(400, { error: "Missing email or code" });

    const store = getStore("email_codes");

    let raw;
    try {
      raw = await store.get(email.toLowerCase());
    } catch (e) {
      console.error("verify-code: blobs get failed", e);
      return json(500, { error: "Storage unavailable" });
    }

    if (!raw) return json(400, { error: "No active code for this email" });

    let rec;
    try {
      rec = JSON.parse(raw); // { codeHash, exp, issuedAt? }
    } catch {
      return json(500, { error: "Corrupt stored record" });
    }

    if (rec.exp && Date.now() > rec.exp) return json(400, { error: "Code expired" });

    const calcHash = sha256(String(code).toUpperCase());
    const ok = calcHash === rec.codeHash;

    if (ok) {
      // Invalidate the code after successful verification.
      try {
        await store.delete(email.toLowerCase());
      } catch (e) {
        console.warn("verify-code: delete failed", e);
      }
    }

    return json(200, { ok });
  } catch (err) {
    console.error("verify-code error", err);
    return json(500, { error: err.message || "Unexpected server error" });
  }
};

/* ------------ helpers ------------ */

function sha256(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}
function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(obj),
  };
}
