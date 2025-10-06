// netlify/functions/create-credentials.js
// Create credentials using EMAIL as the canonical UID.
// Stores:
//   - user_credentials: { uid, alg: 'scrypt', salt, hash, createdAt }
//   - email_index: email -> email  (for check-status hasCredentials)

import crypto from "crypto";
import { getStore } from "@netlify/blobs";

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  try {
    const { email, password } = JSON.parse(event.body || "{}");

    // Use email as the only identity
    const uid = (email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(uid)) {
      return json(400, { error: "Invalid email" });
    }
    if (typeof password !== "string" || password.length < 8) {
      return json(400, { error: "Password must be at least 8 characters" });
    }

    // Ensure the email completed both steps (verify code + confirm link).
    const status = await readEmailStatus(uid);
    const isVerified  = !!(status && (status.verified || status.verifiedAt));
    const isConfirmed = !!(status && (status.confirmed || status.confirmedAt));
    if (!isVerified || !isConfirmed) {
      return json(403, { error: "Email not fully verified/confirmed" });
    }

    // Blob stores
    const creds = getStore({ name: "user_credentials" });
    const index = getStore({ name: "email_index" });

    // Don't allow duplicates for this email
    const existing = await creds.get(uid);
    if (existing) return json(409, { error: "Email already has credentials" });

    // Hash password with scrypt
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = await scryptHex(password, salt);

    const record = {
      uid,
      alg: "scrypt",
      salt,
      hash,
      createdAt: Date.now(),
    };

    await creds.set(uid, JSON.stringify(record));
    // Keep check-status happy: email_index.get(email) should be truthy
    await index.set(uid, uid);

    return json(200, { ok: true, message: "Account created", uid });
  } catch (e) {
    console.error("create-credentials error:", e);
    return json(500, { error: "Unexpected server error" });
  }
};

/* ---------------- helpers ---------------- */

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}

async function scryptHex(password, saltHex) {
  const salt = Buffer.from(saltHex, "hex");
  const key = await new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, dk) =>
      err ? reject(err) : resolve(dk)
    )
  );
  return key.toString("hex");
}

// Read verification/confirmation from preferred 'email_status' store,
// and gracefully fall back to legacy 'verified_emails' if present.
async function readEmailStatus(emailKey) {
  const tryStores = ["email_status", "verified_emails"];
  for (const name of tryStores) {
    try {
      const store = getStore({ name });
      const raw = await store.get(emailKey);
      if (!raw) continue;
      try {
        return JSON.parse(raw);
      } catch {
        // ignore JSON parse errors, try next
      }
    } catch {
      // store might not exist; continue
    }
  }
  return null;
}
