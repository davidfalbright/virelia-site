// netlify/functions/request-code.mjs
import crypto from "node:crypto";
import dns from "node:dns/promises";
import { getStore } from "@netlify/blobs";

/**
 * POST /.netlify/functions/request-code
 * Body: { "email": "you@example.com" }
 */
export const handler = async (event) => {
  // Simple CORS (harmless even if same-origin)
  if (event.httpMethod === "OPTIONS") {
    return cors(204, "");
  }
  if (event.httpMethod !== "POST") {
    return cors(405, JSON.stringify({ error: "Method Not Allowed" }));
  }

  try {
    let body = {};
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return cors(400, JSON.stringify({ error: "Invalid JSON body" }));
    }

    const email = String(body.email || "").trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return cors(400, JSON.stringify({ error: "Invalid or missing email" }));
    }

    // Optional MX check
    const STRICT_MX = (process.env.STRICT_MX || "false").toLowerCase() === "true";
    if (STRICT_MX) {
      const okMx = await hasMx(email).catch(() => false);
      if (!okMx) return cors(400, JSON.stringify({ error: "Email domain has no MX records" }));
    }

    // Required env
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const FROM_EMAIL = process.env.FROM_EMAIL;
    const CODE_SIGNING_SECRET = process.env.CODE_SIGNING_SECRET;
    if (!RESEND_API_KEY || !FROM_EMAIL || !CODE_SIGNING_SECRET) {
      console.error("Missing envs", {
        hasResend: !!RESEND_API_KEY,
        hasFrom: !!FROM_EMAIL,
        hasSecret: !!CODE_SIGNING_SECRET,
      });
      return cors(500, JSON.stringify({ error: "Server not configured" }));
    }

    // Generate code & payload to store
    const code = genCvc(); // e.g. BAV-REK
    const codeHash = sha256(code.toUpperCase());
    const issuedAt = Date.now();
    const exp = issuedAt + 10 * 60 * 1000; // 10 minutes

    // Confirmation link (JWT-like HMAC token)
    const token = signToken(
      { email, exp: issuedAt + 30 * 60 * 1000, purpose: "confirm" },
      CODE_SIGNING_SECRET
    );
    const base = publicBaseUrl(event);
    const confirmLink = `${base}/.netlify/functions/confirm-email?token=${encodeURIComponent(
      token
    )}`;

    // Compose email
    const subject = "Verify your email";
    const text =
      `Your verification code: ${code}\n\n` +
      `Please confirm your email by clicking this link:\n${confirmLink}\n\n` +
      `The code expires in 10 minutes.`;
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
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: email,
        subject,
        text,
        html,
      }),
    });

    if (!emailRes.ok) {
      const detail = await safeText(emailRes);
      console.error("Resend failed", emailRes.status, detail);
      return cors(502, JSON.stringify({ error: "Email provider error", detail }));
    }

    // Persist to Blobs (PRODUCTION requires no token)
    try {
      const store = getStore("email_codes");
      await store.set(
        email.toLowerCase(),
        JSON.stringify({ codeHash, exp, issuedAt })
      );
    } catch (e) {
      console.error("Blobs set failed", e);
      // We still return 200 so the user can try the code from email,
      // but the verify step will fail if persistence is unavailable.
      return cors(
        200,
        JSON.stringify({
          ok: true,
          note: "Email sent, but we could not persist the code.",
        })
      );
    }

    return cors(
      200,
      JSON.stringify({
        ok: true,
        email,
        expiresAt: exp,
      })
    );
  } catch (err) {
    console.error("request-code error:", err);
    return cors(500, JSON.stringify({ error: err.message || "Unexpected server error" }));
  }
};

/* ---------------- helpers ---------------- */

function genCvc() {
  const C = "BCDFGHJKMNPQRSTVWXYZ";
  const V = "AEU";
  const pick = (s) => s[Math.floor(Math.random() * s.length)];
  const tri = () => pick(C) + pick(V) + pick(C);
  return `${tri()}-${tri()}`;
}

async function hasMx(email) {
  const domain = email.split("@")[1];
  const mx = await dns.resolveMx(domain);
  return Array.isArray(mx) && mx.length > 0;
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

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function cors(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": body ? guessType(body) : "text/plain",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
    body,
  };
}

function guessType(body) {
  return body && body.trim().startsWith("{")
    ? "application/json"
    : "text/plain; charset=utf-8";
}
