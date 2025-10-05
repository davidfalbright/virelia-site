import crypto from "crypto";
import { emailCodesStore } from "./_blobs.mjs";

export const handler = async (event) => {
  try {
    const token = new URL(event.rawUrl).searchParams.get("token");
    if (!token) return html(400, "Missing token");

    const secret = process.env.CODE_SIGNING_SECRET;
    if (!secret) return html(500, "Server not configured");

    const payload = verify(token, secret);
    if (!payload || payload.purpose !== "confirm" || payload.exp < Date.now()) {
      return html(400, "Invalid or expired token");
    }

    // Best-effort: persist "confirmed" flag (won’t block success page)
    let note = "";
    try {
      const store = emailCodesStore();
      await store.set(`confirm:${payload.email.toLowerCase()}`, JSON.stringify({ ok: true, at: Date.now() }));
    } catch (e) {
      console.warn("Blobs write failed on confirm:", e);
      note = "Technical note: we couldn't persist the confirm status (Blobs write failed). You may still verify your code.";
    }

    return successPage(note);
  } catch (err) {
    console.error("confirm-email error:", err);
    return html(500, "Unexpected error");
  }
};

/* ---------- helpers ---------- */

function successPage(note) {
  const detail = note
    ? `<p style="margin-top:12px;color:#f5a524">${escapeHtml(note)}</p>`
    : "";
  const body = `
  <div style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:680px;margin:64px auto;padding:24px;border-radius:16px;background:#0b1220;color:#e5e7eb">
    <h2 style="margin:0 0 12px 0">Your email has been confirmed.</h2>
    <p><a href="/" style="color:#93c5fd">Back to iamvirelia.org</a></p>
    ${detail}
  </div>`;
  return html(200, body, true);
}

function verify(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const data = `${h}.${p}`;
  const expected = crypto.createHmac("sha256", secret).update(data).digest("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  if (expected !== s) return null;
  return JSON.parse(Buffer.from(p.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
}

function html(statusCode, body, isHtml = false) {
  return {
    statusCode,
    headers: { "Content-Type": isHtml ? "text/html" : "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    body: isHtml ? body : String(body),
  };
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
