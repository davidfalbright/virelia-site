// netlify/functions/confirm-email.mjs
import crypto from "crypto";
import { getStore } from "@netlify/blobs";

export const handler = async (event) => {
  try {
    const token =
      event.queryStringParameters?.token ||
      new URL(event.rawUrl || `https://${event.headers.host}${event.path}`)
        .searchParams.get("token");

    if (!token) return html(400, "Missing token.");

    const secret = process.env.CODE_SIGNING_SECRET;
    if (!secret) return html(500, "Server not configured.");

    const payload = verifyToken(token, secret); // { email, exp, purpose: "confirm" }
    if (payload.purpose !== "confirm") return html(400, "Invalid token.");
    if (payload.exp && Date.now() > payload.exp) return html(400, "Token expired.");

    // Optional: persist "confirmed" status. If it fails, we still show success.
    const statusStore = getStore("email_status");
    try {
      await statusStore.set(
        payload.email.toLowerCase(),
        JSON.stringify({ confirmed: true, ts: Date.now() })
      );
      return html(200, "Your email has been confirmed. You can now return and enter your code.");
    } catch (e) {
      console.error("confirm-email: persist failed", e);
      return html(
        200,
        "Your email has been confirmed. <small>(Note: we couldn't persist this status; you can still try your code.)</small>"
      );
    }
  } catch (e) {
    console.error("confirm-email error", e);
    return html(500, "Unexpected error");
  }
};

/* ------------ helpers ------------ */

function b64urlDecode(s) {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString();
}

function verifyToken(token, secret) {
  const [h, p, s] = token.split(".");
  if (!s) throw new Error("Malformed token");
  const data = `${h}.${p}`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(data)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  if (expected !== s) throw new Error("Bad signature");
  return JSON.parse(b64urlDecode(p));
}

function html(statusCode, textHtml) {
  return {
    statusCode,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    body: `
      <div style="font-family:system-ui;padding:24px;background:#0b1220;color:#e5e7eb">
        <div style="max-width:880px;margin:auto;background:#0f172a;border-radius:12px;padding:24px">
          <p style="font-size:18px;line-height:1.35">${textHtml}</p>
          <p style="margin-top:16px"><a href="/" style="color:#93c5fd">Back to iamvirelia.org</a></p>
        </div>
      </div>`,
  };
}
