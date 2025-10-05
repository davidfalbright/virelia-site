// netlify/functions/request-code.mjs
import crypto from "crypto";
import dns from "dns/promises";
import { getStore } from "@netlify/blobs";

/* ---------- tiny helpers ---------- */
function json(status, body) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}
function b64url(b) {
  return Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function signToken(payload, secret) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const sig = crypto.createHmac("sha256", secret).update(data).digest();
  return `${data}.${b64url(sig)}`;
}
function sha256(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}
function genCvc() {
  const C = "BCDFGHJKMNPQRSTVWXYZ";
  const V = "AEU";
  const p = s => s[Math.floor(Math.random() * s.length)];
  const tri = () => p(C) + p(V) + p(C);
  return `${tri()}-${tri()}`;
}
function publicBaseUrl(event) {
  const envBase = process.env.PUBLIC_BASE_URL;
  if (envBase) return envBase.replace(/\/$/, "");
  const host = event.headers["x-forwarded-host"] || event.headers.host;
  const proto = event.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}
function blobsStore(name) {
  if (process.env.NETLIFY_BLOBS_TOKEN && process.env.NETLIFY_SITE_ID) {
    return getStore(name, {
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_BLOBS_TOKEN,
    });
  }
  return getStore(name);
}
/* ---------------------------------- */

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  try {
    const { email } = JSON.parse(event.body || "{}");
    const key = (email || "").trim().toLowerCase();
    if (!key || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) return json(400, { error: "Invalid or missing email" });

    // Optional MX check (opt in with STRICT_MX=true)
    if ((process.env.STRICT_MX || "false").toLowerCase() === "true") {
      try {
        const domain = key.split("@")[1];
        const mx = await dns.resolveMx(domain);
        if (!mx || !mx.length) return json(400, { error: "Email domain has no MX records" });
      } catch {
        return json(400, { error: "Email domain MX lookup failed" });
      }
    }

    const code = genCvc(); // BAV-REK style
    const record = {
      codeHash: sha256(code.toUpperCase()),
      exp: Date.now() + 10 * 60 * 1000,       // 10 min
      issuedAt: Date.now(),
    };

    // Build confirm link
    const confirmToken = signToken(
      { email: key, exp: Date.now() + 30 * 60 * 1000, purpose: "confirm" },
      process.env.CODE_SIGNING_SECRET || "dev-secret"
    );
    const confirmLink = `${publicBaseUrl(event)}/.netlify/functions/confirm-email?token=${encodeURIComponent(confirmToken)}`;

    // Send the email (Resend)
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const FROM_EMAIL = process.env.FROM_EMAIL;
    if (!RESEND_API_KEY || !FROM_EMAIL) return json(500, { error: "Email provider not configured" });

    const html = `
<div style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <p>Your verification code:</p>
  <p style="font-size:24px;font-weight:700;letter-spacing:.08em">${code}</p>
  <p><a href="${confirmLink}">Click here to Confirm your email</a></p>
  <p style="color:#4b5563">The code expires in 10 minutes.</p>
</div>`.trim();

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: key,
        subject: "Verify your email",
        text: `Your code: ${code}\n\nConfirm your email:\n${confirmLink}\n\nThe code expires in 10 minutes.`,
        html,
      }),
    });
    if (!emailRes.ok) {
      const detail = await emailRes.text().catch(() => "");
      return json(502, { error: "Email provider error", detail });
    }

    // Persist (works with auto-injected context OR PAT+SiteID)
    const codes = blobsStore("email_codes");
    await codes.set(key, JSON.stringify(record));

    return json(200, { ok: true });
  } catch (err) {
    console.error("request-code error:", err);
    return json(500, { error: err?.message || "Unexpected server error" });
  }
};
