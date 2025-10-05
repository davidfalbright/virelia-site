// netlify/functions/request-code.mjs
import crypto from "crypto";
import dns from "dns/promises";
import { getStore } from "@netlify/blobs";

/* ---------- tiny helpers ---------- */
const json = (status, body) => ({
  statusCode: status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});
const b64url = (b) => Buffer.from(b).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const sign = (payload, secret) => {
  const h = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac("sha256", secret).update(`${h}.${p}`).digest());
  return `${h}.${p}.${sig}`;
};
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const C = "BCDFGHJKMNPQRSTVWXYZ", V = "AEU";
const tri = () => C[Math.floor(Math.random()*C.length)] + V[Math.floor(Math.random()*V.length)] + C[Math.floor(Math.random()*C.length)];
const genCvc = () => `${tri()}-${tri()}`;
const hasMx = async (email) => {
  const domain = email.split("@")[1];
  const mx = await dns.resolveMx(domain);
  return Array.isArray(mx) && mx.length > 0;
};
// When Netlify hasn't injected Blobs context, fall back to env-based manual options
const storeOpts = () => {
  const siteID = process.env.NETLIFY_SITE_ID || "";
  const token  = process.env.NETLIFY_BLOBS_TOKEN || "";
  return siteID && token ? { siteID, token } : undefined;
};

/* ---------- function ---------- */
export const handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  try {
    const { email } = JSON.parse(event.body || "{}");
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return json(400, { error: "Invalid or missing email" });
    }

    // Optional domain check
    const STRICT_MX = (process.env.STRICT_MX || "false").toLowerCase() === "true";
    if (STRICT_MX && !(await hasMx(email).catch(() => false))) {
      return json(400, { error: "Email domain has no MX records" });
    }

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const FROM_EMAIL = process.env.FROM_EMAIL;
    const CODE_SIGNING_SECRET = process.env.CODE_SIGNING_SECRET;
    if (!RESEND_API_KEY || !FROM_EMAIL || !CODE_SIGNING_SECRET) {
      return json(500, { error: "Server not configured" });
    }

    // Create code, link & email
    const code = genCvc();
    const codeHash = sha256(code.toUpperCase());
    const exp = Date.now() + 10 * 60 * 1000;

    const base =
      (process.env.PUBLIC_BASE_URL || `${event.headers["x-forwarded-proto"] || "https"}://${event.headers["x-forwarded-host"] || event.headers.host}`).replace(/\/$/, "");
    const confirmToken = sign({ email, exp: Date.now() + 30 * 60 * 1000, purpose: "confirm" }, CODE_SIGNING_SECRET);
    const confirmLink = `${base}/.netlify/functions/confirm-email?token=${encodeURIComponent(confirmToken)}`;

    const html = `
<div style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <p>Your verification code:</p>
  <p style="font-size:24px;font-weight:700;letter-spacing:.08em">${code}</p>
  <p><a href="${confirmLink}">Click here to Confirm your email</a></p>
  <p style="color:#4b5563">The code expires in 10 minutes.</p>
</div>`.trim();

    // Send email first (so user still gets mail even if Blobs write has an issue)
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: email,
        subject: "Verify your email",
        text: `Your code: ${code}\n\nConfirm: ${confirmLink}\n\nExpires in 10 minutes.`,
        html,
      }),
    });
    if (!emailRes.ok) {
      const detail = await emailRes.text().catch(() => "");
      return json(502, { error: "Email provider error", detail });
    }

    // Persist code to Blobs (robust to missing platform context)
    let blobOk = true, blobErr = null;
    try {
      const codes = storeOpts()
        ? getStore("email_codes", storeOpts())
        : getStore("email_codes");
      await codes.set(email.toLowerCase(), JSON.stringify({ codeHash, exp }));
    } catch (e) {
      blobOk = false;
      blobErr = (e && (e.message || e.toString())) || "Blobs write failed";
      console.error("Blobs set failed", e);
    }

    return json(200, {
      ok: true,
      message: blobOk
        ? "Email sent. Click the Confirm link and enter the code."
        : "Email sent. (Temporary note: could not persist the code; please try again if verification fails.)",
      blobOk,
      ...(blobOk ? {} : { blobError: blobErr }),
    });
  } catch (err) {
    console.error("request-code error:", err);
    return json(500, { error: "Unexpected server error" });
  }
};
