// netlify/functions/login.js
// Accepts { loginId, password } where loginId is usually an EMAIL (new scheme).
// Tries new store first (user_credentials with email as key), then falls back
// to legacy stores (users + email_index) if needed.

import crypto from "crypto";
import { getStore } from "@netlify/blobs";

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  try {
    const { loginId, password } = JSON.parse(event.body || "{}");
    if (!loginId || !password) return json(400, { error: "Missing loginId or password" });

    const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isEmail = looksLikeEmail.test(loginId);
    const emailKey = (isEmail ? String(loginId).toLowerCase().trim() : null);

    // 1) Try NEW scheme: user_credentials keyed by email
    let cred = null;
    let authEmail = null;  // email we’ll put into the session
    const newStore = getStore({ name: "user_credentials" });
    if (emailKey) {
      const raw = await newStore.get(emailKey);
      if (raw) {
        cred = safeJSON(raw);
        authEmail = emailKey;
      }
    }

    // 2) If not found, try LEGACY:
    //    a) username path (loginId is a username)
    //    b) email -> username path via email_index
    if (!cred) {
      const users = getStore({ name: "users" });
      const emailIndex = getStore({ name: "email_index" });

      if (!isEmail) {
        // treat loginId as legacy username
        const rawUser = await users.get(String(loginId).toLowerCase());
        if (rawUser) {
          cred = mapLegacyUser(safeJSON(rawUser));
          authEmail = (cred && cred.uid) || null;
        }
      } else {
        // loginId is email, map to username via legacy index
        const uname = await emailIndex.get(emailKey);
        if (uname) {
          const rawUser = await users.get(String(uname).toLowerCase());
          if (rawUser) {
            cred = mapLegacyUser(safeJSON(rawUser));
            authEmail = (cred && cred.uid) || null;
          }
        }
      }
    }

    if (!cred || !authEmail) return json(401, { error: "Invalid credentials" });

    // Validate password with scrypt (new or legacy structure)
    const ok = await verifyPasswordScrypt(password, cred.salt, cred.hash);
    if (!ok) return json(401, { error: "Invalid credentials" });

    // Sign session
    const SECRET = process.env.SESSION_SIGNING_SECRET || process.env.CODE_SIGNING_SECRET;
    if (!SECRET) return json(500, { error: "Server not configured" });

    const now = Date.now();
    const sessionToken = signToken(
      {
        sub: authEmail,  // subject is the email/uid
        email: authEmail,
        iat: now,
        exp: now + 60 * 60 * 1000, // 1 hour
      },
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
  const salt = u.salt_hex || u.salt;
  const hash = u.pwd_scrypt_hex || u.hash;
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
