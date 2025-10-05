// netlify/functions/request-code.mjs
import crypto from "crypto";
import dns from "dns/promises";
import { getStore } from "@netlify/blobs";

/* ---------- helpers ---------- */

const json = (status, body) => ({
  statusCode: status,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  },
  body: JSON.stringify(body),
});

const b64url = (b) =>
  Buffer.from(b)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

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

const genCvc = () => {
  const C = "BCDFGHJKMNPQRSTVWXYZ";
  const V = "AEU";
  const pick = (s) => s[Math.floor(Math.random() * s.length)];
  const tri = () => pick(C) + pick(V) + pick(C);
  return `${tri()}-${tri()}`; // ABC-DEF
};

async function hasMx(email) {
  const domain = email.split("@")[1];
  const mx = await dns.resolveMx(domain);
  return Array.isArray(mx) && mx.length > 0;
}

/**
 * Write to Blobs with auto context, falling back to manual siteID/token.
 * Returns { mode: 'auto' | 'manual' } on success.
 */
async function blobsSetWithFallback(storeName, key, value) {
  // 1) try auto-injected context
  try {
    const s = getStore(storeName);
    await s.set(key, value);
    return { mode: "auto" };
  } catch (e) {
    // 2) manual fallback
    const siteID = process.env.NETLIFY_SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN;
    if (!siteID || !token) {
      const msg =
        "Blobs auto context failed and NETLIFY_SITE_ID / NETLIFY_BLOBS_TOKEN are not set.";
      const err = new Error(msg);
      err.cause = e;
      throw err;
    }
    const s = getStore(storeName, { siteID, token });
    await s.set(key, value);
    return { mode: "manual" };
  }
}

/* ---------- lambda ---------- */

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method Not Allowed" });
  }

  try {
    const { email } = JSON.parse(event.body || "{}");

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(400, { error: "Invalid or missing email" });
    }

    const STRICT_MX = (process.env.STRICT_MX || "false").toLowerCase() === "true";
    if (STRICT_MX && !(await hasMx(email).catch(() => false))) {
      return json(400, { error: "Email domain has no MX records" });
    }

    // generate code + hash
    const code = genCvc();
    const codeHash = sha256(code.toUpperCase());
    const exp = Date.now() + 10 * 60 * 1000; // 10 minutes

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const FROM_EMAIL = process.env.FROM_EMAIL;
    const CODE_SIGNING_SECRET = process.env.CODE_SIGNING_SECRET;

    if (!RESEND_API_KEY || !FROM_EMAIL || !CODE_SIGNING_SECRET) {
      return json(500, { error: "Server not configured" });
    }

    // build confirm link
    const base = publicBaseUrl(event);
    const confirmToken = signToken(
      { email, exp: Date.now() + 30 * 60 * 1000, purpose: "confirm" },
      CODE_SIGNING_SECRET
    );
    const confirmLink = `${base}/.netlify/functions/confirm-email?token=${encodeURIComponent(
      confirmToken
    )}`;

    const html = `
<div style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <p>Your verification code:</p>
  <p style="font-size:24px;font-weight:700;letter-spacing:.08em">${code}</p>
  <p><a href="${confirmLink}">Click here to Confirm your email</a></p>
  <p style="color:#4b5563">The code expires in 10 minutes.</p>
</div>`.trim();

    // send email via Resend
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: email,
        subject: "Verify your email",
        text:
          `Your code: ${code}\n\n` +
          `Please also confirm your email by clicking:\n${confirmLink}\n\n` +
          `The code expires in 10 minutes.`,
        html,
      }),
    });

    if (!emailRes.ok) {
      const detail = await emailRes.text().catch(() => "");
      return json(502, { error: "Email provider error", detail });
    }

    // persist code hash (auto → fallback to manual)
    const key = email.toLowerCase().trim();
    const record = JSON.stringify({ codeHash, exp, issuedAt: Date.now() });
    const persisted = await blobsSetWithFallback("email_codes", key, record);

    return json(200, { ok: true, persistedVia: persisted.mode });
  } catch (err) {
    console.error("request-code error:", err);
    return json(500, {
      error: "Unexpected server error",
      detail: err?.message,
      cause: err?.cause?.message,
    });
  }
};
