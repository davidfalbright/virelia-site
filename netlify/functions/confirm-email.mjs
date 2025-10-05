// netlify/functions/confirm-email.mjs
import crypto from "crypto";
import { getStore } from "@netlify/blobs";

/* ---------- helpers ---------- */
const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
const fromB64url = (s) =>
  Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

function verifyToken(token, secret) {
  if (!token || !secret) throw new Error("Missing token or secret");
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) throw new Error("Malformed token");

  const data = `${h}.${p}`;
  const expSig = crypto.createHmac("sha256", secret).update(data).digest();
  const gotSig = fromB64url(s);

  // constant-time compare
  if (expSig.length !== gotSig.length || !crypto.timingSafeEqual(expSig, gotSig)) {
    throw new Error("Invalid signature");
  }

  const payload = JSON.parse(fromB64url(p).toString("utf8"));
  if (payload.exp && Date.now() > payload.exp) throw new Error("Token expired");
  return payload; // { email, exp, purpose }
}

// open a store; use platform context if present, else fall back to env token
function openStore(name) {
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  const siteID = process.env.NETLIFY_SITE_ID;
  return token
    ? getStore(name, { siteID, token })
    : getStore(name);
}

function html(body) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    body,
  };
}

/* ---------- function ---------- */
export const handler = async (event) => {
  try {
    const token = event.queryStringParameters?.token || "";
    const secret = process.env.CODE_SIGNING_SECRET;
    const payload = verifyToken(token, secret); // throws on error

    const email = String(payload.email || "").toLowerCase();
    let note = "";

    // Persist "confirmed" (best-effort)
    try {
      const statusStore = openStore("email_status");
      await statusStore.set(email, JSON.stringify({ confirmed: true, ts: Date.now() }));
    } catch (err) {
      // Don’t fail the page; only show a technical note
      note = `<p class="note">Technical note: we couldn't persist the confirm status (Blobs write failed). You may still verify your code.</p>`;
      console.error("Blobs write failed in confirm-email:", err);
    }

    return html(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Email confirmed</title>
<style>
  body{background:#0b0f16;color:#e7edf5;font:16px/1.5 system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0;padding:40px}
  .card{max-width:760px;margin:0 auto;background:#0f1622;border-radius:14px;padding:28px 28px}
  h1{font-size:28px;margin:0 0 10px}
  a{color:#8bd3ff;text-decoration:none}
  .note{margin-top:10px;color:#f6a500}
</style>
</head>
<body>
  <div class="card">
    <h1>Your email has been confirmed.</h1>
    <p><a href="/">Back to iamvirelia.org</a></p>
    ${note}
  </div>
</body>
</html>`);
  } catch (err) {
    console.error("confirm-email error:", err);
    return html(`<!doctype html><meta charset="utf-8"><body style="background:#0b0f16;color:#f9b; font-family:system-ui; padding:40px">Unexpected error</body>`);
  }
};
