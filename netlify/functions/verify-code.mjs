import crypto from "crypto";
import { emailCodesStore } from "./_blobs.mjs";

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });
  try {
    const { email, code } = JSON.parse(event.body || "{}");
    if (!email || !code) return json(400, { error: "Missing email or code" });

    const store = emailCodesStore();
    const entry = await store.get(email.trim().toLowerCase());
    if (!entry) return json(400, { error: "No code on record" });

    const { codeHash, exp } = JSON.parse(entry);
    if (Date.now() > exp) return json(400, { error: "Code expired" });

    const ok = codeHash === sha256(code);
    return json(200, { ok });
  } catch (e) {
    console.error("verify-code error:", e);
    return json(500, { error: e.message || "Unexpected server error" });
  }
};

function sha256(s) {
  return crypto.createHash("sha256").update(String(s).toUpperCase()).digest("hex");
}
function json(statusCode, obj) {
  return { statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(obj) };
}
