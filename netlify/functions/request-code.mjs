// --- after you build html/text/confirmLink etc. ---

// SEND via Resend with diagnostics
const emailRes = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    from: process.env.FROM_EMAIL,         // try onboarding@resend.dev to test quickly
    to: email,
    subject: "Verify your email",
    text:
      `Your code: ${code}\n\n` +
      `Please also confirm your email by clicking:\n${confirmLink}\n\n` +
      `The code expires in 10 minutes.`,
    html,
  }),
});

// Resend usually returns 202 when it accepted the message.
const providerText = await emailRes.text().catch(() => "");
const providerOk   = emailRes.ok; // true only if HTTP 2xx
if (!providerOk) {
  console.error("Resend error", emailRes.status, providerText);
  return json(502, { ok: false, error: "Email provider error", detail: providerText });
}

// Try to parse the returned id (useful in Resend dashboard)
let providerId = null;
try { providerId = JSON.parse(providerText).id || null; } catch {}

// --- Blobs: ALWAYS pass siteID + token on free tier ---
let blobOk = true, blobError = null;
try {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN;
  const codes  = getStore('email_codes', { siteID, token });

  await codes.set(email.toLowerCase(), JSON.stringify({
    codeHash, exp, issuedAt: Date.now()
  }));
} catch (err) {
  blobOk = false;
  blobError = err?.message || String(err);
  console.warn("Blobs set failed", blobError);
}

return json(200, {
  ok: true,
  message: blobOk
    ? "Email sent."
    : "Email sent. (Temporary note: could not persist the code; please try again if verification fails.)",
  providerId,
  blobOk,
  blobError
});
