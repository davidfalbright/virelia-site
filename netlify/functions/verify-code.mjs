// netlify/functions/verify-code.mjs
// Validates the user-entered code against the hash in Blobs,
// then marks the email as verified in the status store.

import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const bad = (status = 400, body = { error: "Bad request" }) => json(status, { ok: false, ...body });

const looksLikeEmail = (s = "") => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
const normalizeCode = (s = "") => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

export default async (req, context) => {
  try {
    if (req.method !== "POST") return bad(405, { error: "Method Not Allowed" });

    const { email, code } = await req.json().catch(() => ({}));
    const key = (email || "").trim().toLowerCase();
    if (!looksLikeEmail(key)) return bad(400, { error: "Valid email required." });
    if (!code || normalizeCode(code).length !== 6) return bad(400, { error: "Valid 6-character code required." });

    const siteID = process.env.NETLIFY_SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN;

    // 1) Read hashed code from email_codes
    const codes = getStore({ name: "email_codes", siteID, token });
    const raw = await codes.get(key);
    if (!raw) return bad(400, { error: "Invalid code." });

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return bad(400, { error: "Invalid code." });
    }

    const { codeHash, exp } = parsed || {};
    if (!codeHash || !exp || Date.now() > exp) {
      return bad(400, { error: "Invalid or expired code." });
    }

    const cleaned = normalizeCode(code);
    const gotHash = crypto.createHash("sha256").update(cleaned).digest("hex");
    if (gotHash !== codeHash) return bad(400, { error: "Invalid code." });

    // 2) Mark verified in a single status store
    const statusStore = getStore({ name: "email_status", siteID, token });
    const current = JSON.parse((await statusStore.get(key)) || "null") || {};
    const updated = {
      ...current,
      email: key,
      verified: true,
      verifiedAt: Date.now(),
    };
    await statusStore.set(key, JSON.stringify(updated));

    // (optional hardening) prevent code reuse
    await codes.delete(key).catch(() => {});

    return json(200, {
      ok: true,
      message: updated.confirmed
        ? "Code verified and email confirmed. You may proceed."
        : "Code verified. (If your email isn’t confirmed yet, click the link in the email.)",
      verified: true,
      confirmed: !!updated.confirmed,
    });
  } catch (e) {
    const msg = (e && e.message) || "Unexpected server error";
    return json(500, { ok: false, error: msg });
  }
};
