// netlify/functions/confirm-email.mjs
import crypto from "crypto";
import { getStore } from "@netlify/blobs";

export const handler = async (event) => {
  try {
    const token = (event.queryStringParameters || {}).token || "";
    const secret = process.env.CODE_SIGNING_SECRET;
    if (!token || !secret) return html(400, "Invalid token.");

    const [h, p, s] = token.split(".");
    const okSig = crypto.createHmac("sha256", secret).update(`${h}.${p}`).digest();
    const gotSig = Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    if (!crypto.timingSafeEqual(okSig, gotSig)) return html(400, "Invalid token.");

    const payload = JSON.parse(Buffer.from(p.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    if (payload.exp && Date.now() > payload.exp) return html(400, "Link expired.");

    // Mark confirmed in Blobs
    const confirmations = getStore({
      name: "email_confirmations",
      siteID: process.env.NETLIFY_SITE_ID,
      token : process.env.NETLIFY_BLOBS_TOKEN,
    });
    const key = (payload.email || "").trim().toLowerCase();
    await confirmations.set(key, JSON.stringify({ confirmedAt: Date.now() }));

    return html(200,
      `Your email has been confirmed.<br/><br/>
       <a href="/">Back to iamvirelia.org</a>`);
  } catch (e) {
    console.error("confirm-email error:", e);
    return html(500, "Unexpected error");
  }
};

const html = (status, body) => ({
  statusCode: status,
  headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  body: `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1">
  <body style="font:16px system-ui;color:#e5e7eb;background:#0b0f1a">
  <div style="max-width:720px;margin:48px auto;padding:28px;border-radius:14px;background:#0f172a">
  <div style="font-size:24px;margin-bottom:12px">Your email has been confirmed.</div>
  <div style="color:#f59e0b;margin:8px 0 20px">Technical note: we couldn't persist the confirm status (Blobs write failed) — if you still see that, try again later.</div>
  <a style="color:#93c5fd" href="/">Back to iamvirelia.org</a>
  </div></body>`,
});
