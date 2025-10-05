// netlify/functions/request-code.mjs
// Sends a 6-char code + confirm link and persists a hash of the code in Blobs.

import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";

// ---- config ----
const DAY_MS = 24 * 60 * 60 * 1000; // 24 hours for both code and link

// ---------- helpers ----------
const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const bad = (status = 400, body = { error: "Bad request" }) =>
  json(status, { ok: false, ...body });

const looksLikeEmail = (s = "") => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

// normalize a code like "ABC-123" -> "ABC123"
const normalizeCode = (s = "") => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

// random code: 3 letters + "-" + 3 letters (A–Z)
function makeCode() {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const pick = (n) =>
    Array.from({ length: n }, () => A[Math.floor(Math.random() * A.length)]).join("");
  return `${pick(3)}-${pick(3)}`;
}

// HMAC-based confirm token (base64url(header).base64url(payload).signature)
// NOTE: payload.exp is in **milliseconds** to match confirm-email.mjs.
function makeConfirmToken(email, expiresAtMs) {
  const secret = process.env.CODE_SIGNING_SECRET || "";
  if (!secret) throw new Error("Missing CODE_SIGNING_SECRET");

  const enc = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");

  const header = { alg: "HS256", typ: "JWT" };
  const payload = { email, exp: expiresAtMs }; // ms

  const h = enc(header);
  const p = enc(payload);
  const signature = crypto.createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${signature}`;
}

// Use Resend; you can swap in any provider you like.
async function sendEmail({ to, from, subject, html, text }) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
  if (!RESEND_API_KEY) throw new Error("Missing RESEND_API_KEY");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ to, from, subject, html, text }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Email provider error: ${res.status} ${detail}`);
  }
}

const publicBaseUrl = (req) => {
  const envBase = process.env.PUBLIC_BASE_URL;
  if (envBase) return envBase.replace(/\/$/, "");
  const origin = req.headers.get("origin");
  if (origin) return origin.replace(/\/$/, "");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  const proto = req.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
};

// ---------- function ----------
export default async (req) => {
  try {
    if (req.method !== "POST") return bad(405, { error: "Method Not Allowed" });

    const { email } = await req.json().catch(() => ({}));
    if (!looksLikeEmail(email)) return bad(400, { error: "Please provide a valid email." });

    // Compute code + persist only its hash (never store raw code)
    const rawCode = makeCode(); // shown to user in the email
    const cleaned = normalizeCode(rawCode);
    const codeHash = crypto.createHash("sha256").update(cleaned).digest("hex");

    // ---- 24h for the code ----
    const exp = Date.now() + DAY_MS;

    const siteID = process.env.NETLIFY_SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN;
    if (!siteID || !token) throw new Error("Missing Netlify Blobs configuration");

    const codes = getStore({
      name: "email_codes",
      siteID,
      token,
    });

    const key = (email || "").trim().toLowerCase();
    await codes.set(
      key,
      JSON.stringify({
        codeHash,
        exp, // ms
        issuedAt: Date.now(),
      })
    );

    // Build confirm link — also 24h
    const base = publicBaseUrl(req);
    const confirmToken = makeConfirmToken(key, Date.now() + DAY_MS);
    const confirmUrl = `${base}/.netlify/functions/confirm-email?token=${encodeURIComponent(
      confirmToken
    )}`;

    const FROM = process.env.FROM_EMAIL || "no-reply@example.com";
    const subject = "Verify your email";
    const text = `Your verification code: ${rawCode}

Confirm your email: ${confirmUrl}

This code and link expire in 24 hours.`;
    const html = `
      <div style="font-family:system-ui,Arial,sans-serif;line-height:1.45">
        <h2>Verify your email</h2>
        <p>Your verification code:</p>
        <p style="font-size:20px;font-weight:700;letter-spacing:2px">${rawCode}</p>
        <p><a href="${confirmUrl}">Click here to Confirm your email</a></p>
        <p style="color:#777">This code and link expire in <strong>24 hours</strong>.</p>
      </div>
    `;

    await sendEmail({ to: key, from: FROM, subject, html, text });

    return json(200, {
      ok: true,
      message: "Email sent. Check your inbox (and spam).",
      blobOk: true,
    });
  } catch (e) {
    const msg = (e && e.message) || "Unexpected server error";
    return json(500, { ok: false, error: msg });
  }
};
