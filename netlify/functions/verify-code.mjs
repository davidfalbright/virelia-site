// netlify/functions/verify-code.mjs
import crypto from "crypto";
import { getStore } from "@netlify/blobs";

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return j(405, { error: "Method Not Allowed" });

  try {
    const { email, code } = JSON.parse(event.body || "{}");
    if (!email || !code) return j(400, { error: "Missing email or code" });

    const store = getStore({
      name: "email_codes",
      siteID: process.env.NETLIFY_SITE_ID,
      token : process.env.NETLIFY_BLOBS_TOKEN,
    });

    const key = email.trim().toLowerCase();
    const rec = await store.get(key, { type: "json" });
    if (!rec) return j(400, { error: "No code on record. Please resend." });

    if (Date.now() > rec.exp) return j(400, { error: "Code expired. Please resend." });
    const submitted = sha256((code || "").toUpperCase());
    if (submitted !== rec.codeHash) return j(400, { error: "Invalid code." });

    // you can augment the record here if you want
    return j(200, { ok: true, verified: true });
  } catch (e) {
    console.error("verify-code error:", e);
    return j(500, { error: "Unexpected server error" });
  }
};

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const j = (s, b) => ({ statusCode: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(b) });
