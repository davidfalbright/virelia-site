// netlify/functions/confirm-email.mjs
import crypto from "crypto";
import { getStore } from "@netlify/blobs";

export const handler = async (event) => {
  try {
    const token  = event.queryStringParameters?.token ?? "";
    const secret = process.env.CODE_SIGNING_SECRET;
    if (!token || !secret) return page(400, "Invalid token.");

    const [h, p, s] = token.split(".");
    const okSig = crypto.createHmac("sha256", secret).update(`${h}.${p}`).digest();
    const gotSig = Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    if (!crypto.timingSafeEqual(okSig, gotSig)) return page(400, "Invalid token.");

    const payload = JSON.parse(
      Buffer.from(p.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    );
    if (payload.exp && Date.now() > payload.exp) return page(400, "Link expired.");

    const store = getStore({
      name:  "email_status",                 // must match verify/check code
      siteID: process.env.NETLIFY_SITE_ID,
      token : process.env.NETLIFY_BLOBS_TOKEN,
    });

    const key = (payload.email || "").trim().toLowerCase();

    // Merge instead of overwrite
    let current = {};
    try { current = JSON.parse((await store.get(key)) || "{}"); } catch {}
    current.confirmed   = true;
    current.confirmedAt = Date.now();

    await store.set(key, JSON.stringify(current));

    return page(200, `
      <div style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial">
        <h2>Your email has been confirmed.</h2>
        <p><a href="/">Back to iamvirelia.org</a></p>
      </div>
    `);
  } catch (e) {
    console.error("confirm-email error:", e);
    return page(500, "Unexpected error");
  }
};

const page = (status, body) => ({
  statusCode: status,
  headers: {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  },
  body: `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><body>${body}</body>`,
});
