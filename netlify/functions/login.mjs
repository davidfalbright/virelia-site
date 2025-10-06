// netlify/functions/login.js
// Accepts { loginId, password } (preferred), but also supports legacy
// shapes: { email, password } or { username, password }.
//
// Auth order:
//   1) New scheme: "user_credentials" store keyed by email
//   2) Legacy: "users" store (username key) via direct username or via
//      "email_index" (email -> username)

import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";

const siteID = process.env.NETLIFY_SITE_ID;
const token  = process.env.NETLIFY_BLOBS_TOKEN;

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method Not Allowed" });
  }

  try {
    // Accept new and legacy payload shapes
    const body = JSON.parse(event.body || "{}");
    const loginId =
      (body.loginId ?? body.email ?? body.username ?? "").toString().trim();
    const password = (body.password ?? "").toString();

    if (!loginId || !password) {
      return json(400, { error: "Missing loginId or password" });
    }

    const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isEmail = looksLikeEmail.test(loginId);
    const emailKey = isEmail ? loginId.toLowerCase() : null;

    // 1) Try NEW scheme: user_credentials keyed by email
    let cred = null;         // { uid, salt, hash, alg }
    let authEmail = null;    // email put into session

    if (emailKey) {
      const newStore = getStore({ name: "user_credentials", siteID, token });
      const raw = await newStore.get(emailKey);
      if (raw) {
        const parsed = safeJSON(raw);
        if (parsed && parsed.salt && parsed.hash) {
          cred = { uid: emailKey, salt: parsed.salt, hash: parsed.hash, alg: "scrypt" };
          authEmail = emailKey;
        }
      }
    }

    // 2) Legacy fallbacks
    if (!cred) {
      const users      = getStore({ name: "users",       siteID, token });
      const emailIndex = getStore({ name: "email_index", siteID, token });

      if (!isEmail) {
        // Treat loginId as legacy username
        const uname = loginId.toLowerCase();
        const rawUser = await users.get(uname);
        if (rawUser) {
          const mapped = mapLegacyUser(safeJSON(rawUser));
          if (mapped) {
            cred = mapped;
            authEmail = mapped.uid;
          }
        }
      } else {
        // loginId is email: map to username via legacy index
        const uname = await emailIndex.get(emailKey);
        if (uname) {
          const rawUser = await users.get(String(uname).toLowerCase());
          if (rawUser) {
            const mapped = mapLegacyUser(safeJSON(rawUser));
            if (mapped) {
              cred = mapped;
              authEmail = mapped.uid;
            }
          }
        }
      }
    }

    if (!cred || !authEmail) {
      // Generic message to avoid account enumeration
      return json(401, { error: "Invalid credentials" });
    }

    // Verify password (scrypt)
    const ok = await verifyPasswordScrypt(password, cred.salt, cred.hash);
    if (!ok) return json(401, { error: "Invalid credentials" });

    // Sign session
    const SECRET = process.env.SESSION_SIGNING_SECRET || process.env.CODE_SIGNING_SECRET;
    if (!SECRET) return json(500, { error: "Server not configured" });

    const now = Date.now();
    const sessionToken = signToken(
      { sub: authEmail, email: authEmail, iat: now, exp: now + 60 * 60 * 1000 },
      SECRET
    );

    return json(200, { ok: true, email: authEmail, sessionToken });
  } catch (e) {
    console.error("login error:", e);
    return json(500, { error: "Unexpected server error" });
  }
};

/* ---------------- helpers ---------------- */

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(obj),
  };
}

function safeJSON(s) {
  try { return JSON.parse(s); } catch { return null; }
}

// Convert a legacy "users" record into the { uid, salt, hash } shape
function mapLegacyUser(u) {
  if (!u) return null;
  // Legacy fields: { username, email, pwd_scrypt_hex, salt_hex }
  const email = (u.email || "").toLowerCase().trim();
  const salt  = u.salt_hex || u.salt;
  const hash  = u.pwd_scrypt_hex || u.hash;
  if (!email || !salt || !hash) return null;
  return { uid: email, salt, hash, alg: "scrypt" };
}

async function verifyPasswordScrypt(password, saltHex, expectedHex) {
  if (!saltHex || !expectedHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const attemptHex = await new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, dk) =>
      err ? reject(err) : resolve(dk.toString("hex"))
    )
  );
  const a = Buffer.from(expectedHex, "hex");
  const b = Buffer.from(attemptHex, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function b64url(buf) {
  return Buffer.from(buf)
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
