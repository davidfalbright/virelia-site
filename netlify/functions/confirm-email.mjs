// netlify/functions/confirm-email.mjs
import crypto from "crypto";
import { getStore } from "@netlify/blobs";

export async function handler(event) {
  try {
    const token = event.queryStringParameters?.token || "";
    if (!token) return html(400, "Missing token.");

    const secret = process.env.CODE_SIGNING_SECRET;
    if (!secret) return html(500, "Server not configured (missing CODE_SIGNING_SECRET).");

    // Verify the token
    let payload;
    try {
      payload = verifyToken(token, secret);
    } catch (e) {
      console.error("confirm-email token error:", e);
      return html(400, "Invalid confirmation link.");
    }

    if (payload.purpose !== "confirm") return html(400, "Invalid token purpose.");
    if (typeof payload.exp !== "number" || Date.now() > payload.exp) {
      return html(400, "This confirmation link has expired. Please request a new one.");
    }

    const email = String(payload.email || "").trim().toLowerCase();
    if (!email) return html(400, "Token missing email.");

    // Try to persist "confirmedAt" in Blobs, but don't break the UX if this fails.
    let persisted = false;
    try {
      const store = getStore("email_codes"); // auto-injected in production
      const existing = await store.get(email);
      let data = {};
      try { data = existing ? JSON.parse(existing) : {}; } catch { data = {}; }
      data.confirmedAt = Date.now();
      await store.set(email, JSON.stringify(data));
      persisted = true;
    } catch (e) {
      // If Blobs context isn't available, log it, but let the user proceed.
      console.warn("confirm-email: blobs write failed (non-blocking):", e?.message || e);
    }

    // Friendly success page
    const msg = persisted
      ? "Your email has been confirmed. You can return to the site and enter your code."
      : "Your email has been confirmed. (Note: we couldn't persist this status; you can still try your code.)";

    return html(200, msg, {
      extra:
        `<p><a href="/">Back to iamvirelia.org</a></p>` +
        (persisted ? "" : `<p style="color:#f59e0b;">Technical note: Blobs persist failed.</p>`)
    });
  } catch (err) {
    console.error("confirm-email unexpected error:", err);
    return html(500, "Unexpected error.");
  }
}

/* ----------------- token helpers ----------------- */

function b64urlDecode(str) {
  const s = str.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(s, "base64");
}

function timingSafeEqual(a, b) {
  const ab = Buffer.isBuffer(a) ? a : Buffer.from(a);
  const bb = Buffer.isBuffer(b) ? b : Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function verifyToken(jwt, secret) {
  const [h, p, s] = jwt.split(".");
  if (!h || !p || !s) throw new Error("Malformed token");
  const data = `${h}.${p}`;
  const expected = crypto.createHmac("sha256", secret).update(data).digest();
  const sig = b64urlDecode(s);
  if (!timingSafeEqual(expected, sig)) throw new Error("Bad signature");
  const payload = JSON.parse(b64urlDecode(p).toString("utf8"));
  return payload;
}

/* ----------------- small HTML helper ----------------- */

function html(statusCode, message, { extra = "" } = {}) {
  return {
    statusCode,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    body: `<!doctype html><meta charset="utf-8">
      <style>
        body { font: 16px/1.5 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; padding: 2rem; color:#e5e7eb; background:#0b1220; }
        .card { max-width: 640px; background:#111827; padding:1.25rem 1.5rem; border-radius:14px; box-shadow:0 8px 24px rgba(0,0,0,.35); }
        h1 { font-size:20px; margin:0 0 .75rem; color:#e5e7eb; }
        p { margin:.25rem 0; color:#cbd5e1; }
        a { color:#60a5fa; text-decoration:none; }
        a:hover { text-decoration:underline; }
      </style>
      <div class="card">
        <h1>${escapeHtml(message)}</h1>
        ${extra}
      </div>`,
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
