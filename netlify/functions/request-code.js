// netlify/functions/request-code.js
const crypto = require("crypto");
const dns = require("dns").promises;
const { getStore } = require("@netlify/blobs");

// Node 18/20 has global fetch.

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Method Not Allowed" });
  }

  try {
    const { email } = JSON.parse(event.body || "{}");
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(400, { ok: false, error: "Invalid or missing email" });
    }

    // Optional MX check
    const STRICT_MX =
      (process.env.STRICT_MX || "false").toLowerCase() === "true";
    if (STRICT_MX) {
      try {
        await dns.resolveMx(email.split("@")[1]);
      } catch {
        return json(400, { ok: false, error: "Email domain has no MX records" });
      }
    }

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const FROM_EMAIL = process.env.FROM_EMAIL;
    const CODE_SIGNING_SECRET = process.env.CODE_SIGNING_SECRET;
    if (!RESEND_API_KEY || !FROM_EMAIL || !CODE_SIGNING_SECRET) {
      return json(500, { ok: false, error: "Server not configured" });
    }

    // Generate code
    const code = makeCode();                 // e.g. BAV-REK
    const codeHash = sha256(code.toUpperCase());
    const exp = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Confirm link
    const base = publicBaseUrl(event);
    const confirmToken = signToken(
      { email, exp: Date.now() + 30 * 60 * 1000, purpose: "confirm" },
      CODE_SIGNING_SECRET
    );
    const confirmLink =
      `${base}/.netlify/functions/confirm-email?token=${encodeURIComponent(confirmToken)}`;

    const html = `
<div style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <p>Your verification code:</p>
  <p style="font-size:24px;font-weight:700;letter-spacing:.08em">${code}</p>
  <p><a href="${confirmLink}">Click here to Confirm your email</a></p>
  <p style="color:#4b5563">The code expires in 10 minutes.</p>
</div>`.trim();

    // ---- Send via Resend (with diagnostics)
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL, // for a quick test you can use onboarding@resend.dev
        to: email,
        subject: "Verify your email",
        text:
          `Your code: ${code}\n\n` +
          `Confirm your email:\n${confirmLink}\n\n` +
          `The code expires in 10 minutes.`,
        html,
      }),
    });

    const providerText = await emailRes.text().catch(() => "");
    if (!emailRes.ok) {
      console.error("Resend error", emailRes.status, providerText);
      return json(502, {
        ok: false,
        error: "Email provider error",
        detail: providerText,
      });
    }

    // ---- Persist code in Blobs (always pass siteID+token on free tier)
    let blobOk = true, blobError = null;
    try {
      const store = getStore("email_codes", {
        siteID: process.env.NETLIFY_SITE_ID,
        token: process.env.NETLIFY_BLOBS_TOKEN,
      });
      await store.set(
        email.toLowerCase(),
        JSON.stringify({ codeHash, exp, issuedAt: Date.now() })
      );
    } catch (e) {
      blobOk = false;
      blobError = e?.message || String(e);
      console.warn("Blobs set failed", blobError);
    }

    return json(200, {
      ok: true,
      message: blobOk
        ? "Email sent."
        : "Email sent. (Temporary note: could not persist the code; please try again if verification fails.)",
      blobOk,
      blobError,
    });
  } catch (err) {
    console.error("request-code error:", err);
    return json(500, { ok: false, error: "Unexpected server error" });
  }
};

/* ---------------- helpers ---------------- */

function makeCode() {
  const C = "BCDFGHJKMNPQRSTVWXYZ";
  const V = "AEU";
  const pick = (s) => s[Math.floor(Math.random() * s.length)];
  const tri = () => pick(C) + pick(V) + pick(C);
  return `${tri()}-${tri()}`;
}

function sha256(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function b64url(b) {
  return Buffer.from(b)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function signToken(payload, secret) {
  const h = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64url(JSON.stringify(payload));
  const data = `${h}.${p}`;
  const sig = crypto.createHmac("sha256", secret).update(data).digest();
  return `${data}.${b64url(sig)}`;
}

function publicBaseUrl(event) {
  const envBase = process.env.PUBLIC_BASE_URL;
  if (envBase) return envBase.replace(/\/$/, "");
  const host = event.headers["x-forwarded-host"] || event.headers.host;
  const proto = event.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(obj),
  };
}
