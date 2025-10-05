// netlify/functions/request-code.js
import * as crypto from 'node:crypto';
import dns from 'dns/promises';
import { getStore } from '@netlify/blobs';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  try {
    const { email } = JSON.parse(event.body || '{}');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(400, { error: 'Invalid or missing email' });
    }

    // Optional DNS check
    const STRICT_MX = (process.env.STRICT_MX || 'false').toLowerCase() === 'true';
    if (STRICT_MX && !(await hasMx(email).catch(() => false))) {
      return json(400, { error: 'Email domain has no MX records' });
    }

    const code = genCvc();                   // e.g., BAV-REK
    const codeHash = sha256(code.toUpperCase());
    const exp = Date.now() + 10 * 60 * 1000; // 10 minutes

    const RESEND_API_KEY      = process.env.RESEND_API_KEY;
    const FROM_EMAIL          = process.env.FROM_EMAIL;
    const CODE_SIGNING_SECRET = process.env.CODE_SIGNING_SECRET;
    if (!RESEND_API_KEY || !FROM_EMAIL || !CODE_SIGNING_SECRET) {
      return json(500, { error: 'Server not configured' });
    }

    const base = publicBaseUrl(event);
    const confirmToken = signToken(
      { email, exp: Date.now() + 30 * 60 * 1000, purpose: 'confirm' },
      CODE_SIGNING_SECRET
    );
    const confirmLink = `${base}/.netlify/functions/confirm-email?token=${encodeURIComponent(confirmToken)}`;

    // Send via Resend (leave this as-is if you prefer raw fetch)
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_EMAIL,                 // e.g. 'Virelia <no-reply@mail.iamvirelia.org>'
        to: email,
        subject: 'Verify your email',
        text: `Your code: ${code}\n\nPlease also confirm your email by clicking:\n${confirmLink}\n\nThe code expires in 10 minutes.`,
        html: `
          <div style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
            <p>Your verification code:</p>
            <p style="font-size:24px;font-weight:700;letter-spacing:.08em">${code}</p>
            <p><a href="${confirmLink}">Click here to Confirm your email</a></p>
            <p style="color:#4b5563">The code expires in 10 minutes.</p>
          </div>`
      })
    });

    if (!emailRes.ok) {
      const detail = await emailRes.text().catch(() => '');
      // This shows up in Netlify logs so you can see Resend’s error body
      console.error('Resend error', { status: emailRes.status, body: detail });
      return json(502, { error: 'Email provider error', detail });
    }

    // Netlify Blobs — store JSON safely
    const codes = getStore('email_codes');                 // or getStore({ name: 'email_codes' })
    await codes.setJSON(email.toLowerCase(), { codeHash, exp });

    return json(200, { ok: true });
  } catch (err) {
    // <-- This is the key: make the failure visible in Netlify → Logs → Functions
    console.error('request-code failed', { message: err?.message, stack: err?.stack });
    return json(500, { error: 'Unexpected server error', detail: err?.message });
  }
};

// Helpers
function genCvc() {
  const C = 'BCDFGHJKMNPQRSTVWXYZ', V = 'AEU';
  const pick = s => s[Math.floor(Math.random() * s.length)];
  const tri  = () => pick(C) + pick(V) + pick(C);
  return `${tri()}-${tri()}`;
}
async function hasMx(email) {
  const domain = email.split('@')[1];
  const mx = await dns.resolveMx(domain);
  return Array.isArray(mx) && mx.length > 0;
}
function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
function b64url(b)  { return Buffer.from(b).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function signToken(payload, secret) {
  const h = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = b64url(JSON.stringify(payload));
  const data = `${h}.${p}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest();
  return `${data}.${b64url(sig)}`;
}
function publicBaseUrl(event) {
  const envBase = process.env.PUBLIC
