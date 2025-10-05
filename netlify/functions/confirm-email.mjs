// netlify/functions/confirm-email.mjs
import crypto from "crypto";
import { getStore } from "@netlify/blobs";

/* helpers */
const html = (status, message) => ({
  statusCode: status,
  headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  body: `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1">
  <style>body{background:#0b1020;color:#e6edf3;font:16px system-ui;margin:0}
  .card{max-width:720px;margin:4rem auto;padding:2rem;background:#0f172a;border-radius:16px}
  a{color:#93c5fd}</style>
  <div class=card>${message}</div>`,
});
function b64urlDecode(s) {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64").toString();
}
function verifyToken(token, secret) {
  const [h, p, s] = token.split(".");
  const data = `${h}.${p}`;
  const expected = crypto.createHmac("sha256", secret).update(data).digest("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  if (expected !== s) throw new Error("Bad signature");
  return JSON.parse(b64urlDecode(p));
}
function blobsStore(name) {
  if (process.env.NETLIFY_BLOBS_TOKEN && process.env.NETLIFY_SITE_ID) {
    return getStore(name, { siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_BLOBS_TOKEN });
  }
  return getStore(name);
}

export const handler = async (event) => {
  try {
    const token = event.queryStringParameters?.token || "";
    if (!token) return html(400, "<h2>Missing token</h2>");

    const payload = verifyToken(token, process.env.CODE_SIGNING_SECRET || "dev-secret");
    if (payload.purpose !== "confirm") return html(400, "<h2>Invalid token</h2>");
    if (Date.now() > Number(payload.exp || 0)) return html(400, "<h2>Token expired</h2>");

    // Try to persist "confirmedAt" next to the user's code entry.
    let persisted = true;
    try {
      const codes = blobsStore("email_codes");
      const key = String(payload.email || "").trim().toLowerCase();
      const existing = (await codes.get(key, { type: "json" })) || {};
      existing.confirmedAt = Date.now();
      await codes.set(key, JSON.stringify(existing));
    } catch (e) {
      persisted = false;
      console.error("confirm-email: persist failed:", e);
    }

    const note = persisted
      ? ""
      : `<p style="color:#f59e0b">Technical note: we couldn't persist the confirm status (Blobs write failed). You may still verify your code.</p>`;

    return html(
      200,
      `<h2>Your email has been confirmed.</h2>
       <p><a href="/">Back to iamvirelia.org</a></p>
       ${note}`
    );
  } catch (err) {
    console.error("confirm-email error:", err);
    return html(500, "<h2>Unexpected error</h2>");
  }
};
