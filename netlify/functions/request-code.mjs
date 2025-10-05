// netlify/functions/request-code.mjs
import crypto from "crypto";
import dns from "dns/promises";
import { getStore } from "@netlify/blobs";

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  try {
    const { email } = JSON.parse(event.body || "{}");
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: "Invalid or missing email" });

    const STRICT_MX = (process.env.STRICT_MX || "false").toLowerCase() === "true";
    if (STRICT_MX && !(await hasMx(email).catch(() => false))) return json(400, { error: "Email domain has no MX records" });

    const code = genCvc();                               // e.g. ABC-DEF
    const codeHash = sha256(code.toUpperCase());
    const exp = Date.now() + 10 * 60 * 1000;

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const FROM_EMAIL      = process.env.FROM_EMAIL;
    const CODE_SECRET     = process.env.CODE_SIGNING_SECRET;
    if (!RESEND_API_KEY || !FROM_EMAIL || !CODE_SECRET) return json(500, { error: "Server not configured" });

    const base = publicBaseUrl(event);
    const confirmToken = signToken({ email, exp: Date.now() + 30 * 60 * 1000, purpose: "confirm" }, CODE_SECRET);
    const confirmLink  = `${base}/.netlify/functions/confirm-email?token=${encodeURIComponent(confirmToken)}`;

    const html = `
<div style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <p>Your verification code:</p>
  <p style="font-size:24px;font-weight:700;letter-spacing:.08em">${code}</p>
  <p><a href="${confirmLink}">Click here to Confirm your email</a></p>
  <p style="color:#4b5563">The code expires in 10 minutes.</p>
</div>`.trim();

    // Send via Resend
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: email,
        subject: "Verify your email",
        text: `Your code: ${code}\n\nConfirm: ${confirmLink}\n\n(Expires in 10 minutes)`,
        html,
      }),
    });

    if (!emailRes.ok) {
      const detail = await emailRes.text().catch(() => "");
      return json(502, { error: "Email provider error", detail });
    }

    // Persist the code in Blobs (v6 object form + env)
    const store = getStore({
      name: "email_codes",
      siteID: process.env.NETLIFY_SITE_ID,
      token : process.env.NETLIFY_BLOBS_TOKEN,
    });

    const key = email.trim().toLowerCase();
    await store.set(key, JSON.stringify({ codeHash, exp, issuedAt: Date.now() }));

    return json(200, { ok: true, message: "Email sent", storedKey: key });
  } catch (err) {
    console.error("request-code error:", err);
    return json(500, { error: "Unexpected server error" });
  }
};

/* ---------------- helpers ---------------- */
const genCvc = () => {
  const C = "BCDFGHJKMNPQRSTVWXYZ", V = "AEU";
  const p = (s) => s[Math.floor(Math.random() * s.length)];
  const tri = () => p(C) + p(V) + p(C);
  return `${tri()}-${tri()}`;
};
const hasMx = async (email) => (await dns.resolveMx(email.split("@")[1])).length > 0;
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const b64url = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
const signToken = (payload, secret) => {
  const h = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", secret).update(`${h}.${p}`).digest();
  return `${h}.${p}.${b64url(sig)}`;
};
const publicBaseUrl = (event) => {
  const envBase = process.env.PUBLIC_BASE_URL;
  if (envBase) return envBase.replace(/\/$/, "");
  const host = event.headers["x-forwarded-host"] || event.headers.host;
  const proto = event.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
};
const json = (statusCode, body) => ({ statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) });
