// ---- helpers ----
const $ = (id) => document.getElementById(id);
const API = (p) => `/.netlify/functions/${p}`;
const looksLikeEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || '').trim());
const normalizeCVC = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const formatCVC = (s) => (s.length === 6 ? `${s.slice(0,3)}-${s.slice(3)}` : s);
const isCVC = (s) => /^[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(s);

// Elements
const formCreate = $('createAccountForm');
const emailEl = $('email');
const passwordEl = $('password');
const createBtn = $('createAccountBtn');
const msg = $('msg');
const dbg = $('debug');

const verifyCard = $('verifyForm');
const codeEl = $('code');
const verifyBtn = $('verifyBtn');
const msg2 = $('msg2');
const resendLink = $('resendLink');
const refreshLink = $('refreshLink');
const proceedBtn = $('proceedBtn');

const SIGNIN_URL = '/index.html';

// Utilities
function setMsg(el, text, ok = false) {
  if (!el) return;
  el.textContent = text;
  el.className = 'msg ' + (ok ? 'ok' : 'err');
}
function show(el, on = true) { el && el.classList.toggle('hidden', !on); }
function saveEmail(v) { try { localStorage.setItem('lastEmail', v); } catch {} }
function loadEmail() { try { return localStorage.getItem('lastEmail') || ''; } catch { return ''; } }
function debug(obj) { try { dbg.textContent = JSON.stringify(obj, null, 2); } catch {} }

// Format code as ABC-DEF while typing
codeEl?.addEventListener('input', () => {
  const raw = normalizeCVC(codeEl.value);
  codeEl.value = formatCVC(raw);
});

// Prefill last email
window.addEventListener('DOMContentLoaded', () => {
  const saved = loadEmail();
  if (saved && emailEl && !emailEl.value) emailEl.value = saved;
});

// Create account → send code + link
formCreate?.addEventListener('submit', async (e) => {
  e.preventDefault();
  setMsg(msg, ''); setMsg(msg2, ''); debug('');

  const email = (emailEl.value || '').trim();
  const password = (passwordEl.value || '').trim();

  if (!looksLikeEmail(email)) return setMsg(msg, 'Please enter a valid email.');
  if (password.length < 8) return setMsg(msg, 'Password must be at least 8 characters.');

  saveEmail(email);

  createBtn.disabled = true;
  createBtn.textContent = 'Sending…';
  try {
    const res = await fetch(API('request-code'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Password not needed to send code; we only send the email
      body: JSON.stringify({ email })
    });
    const data = await res.json().catch(() => ({}));
    debug({ status: res.status, data });

    if (!res.ok || data.ok === false) {
      return setMsg(msg, data.error || 'Failed to send verification email.');
    }

    setMsg(msg, 'Email sent! Check your inbox (and spam). Click the Confirm link, then enter the 6-digit code below.', true);
    show(verifyCard, true);     // <-- Reveal the code area immediately
    codeEl?.focus();
  } catch (err) {
    debug({ error: (err && err.message) || String(err) });
    setMsg(msg, 'Network error calling request-code.');
  } finally {
    createBtn.disabled = false;
    createBtn.textContent = 'Create Account';
  }
});

// Verify the 6-digit code
$('verifyForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  setMsg(msg2, '');

  const email = (emailEl.value || loadEmail() || '').trim();
  if (!looksLikeEmail(email)) return setMsg(msg2, 'Missing or invalid email.');

  const raw = normalizeCVC(codeEl.value);
  const cvc = formatCVC(raw);
  if (!isCVC(cvc)) return setMsg(msg2, 'Enter the 6-character code like ABC-DEF.');

  verifyBtn.disabled = true;
  verifyBtn.textContent = 'Verifying…';
  try {
    const res = await fetch(API('verify-code'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code: cvc })
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.ok === false) {
      setMsg(msg2, data.error || 'Invalid or expired code. Please resend.');
      verifyBtn.textContent = 'Verify code';
      verifyBtn.disabled = false;
      return;
    }

    // Code verified; now check if the user also clicked the email confirm link
    const status = await checkStatus(email);
    if (status.confirmed && status.verified) {
      setMsg(msg2, 'Code verified and email confirmed. You may proceed to sign in.', true);
      show(proceedBtn, true);
      proceedBtn.onclick = () => (window.location.href = SIGNIN_URL);
    } else {
      setMsg(
        msg2,
        'Code verified. Please click the Confirm link in your email to complete setup.'
      );
    }

    verifyBtn.textContent = 'Verified';
    verifyBtn.disabled = true;
  } catch {
    setMsg(msg2, 'Verification failed. Try again.');
    verifyBtn.textContent = 'Verify code';
    verifyBtn.disabled = false;
  }
});

// Resend convenience
resendLink?.addEventListener('click', (e) => {
  e.preventDefault();
  createBtn.disabled = false;
  createBtn.textContent = 'Create Account';
  formCreate?.dispatchEvent(new Event('submit'));
});

// Refresh status after clicking email’s confirm link
refreshLink?.addEventListener('click', async (e) => {
  e.preventDefault();
  const email = (emailEl.value || loadEmail() || '').trim();
  if (!looksLikeEmail(email)) return setMsg(msg2, 'Enter your email first.');

  const s = await checkStatus(email);
  if (s.confirmed && s.verified) {
    setMsg(msg2, 'Email confirmed and code verified. You may proceed.', true);
    show(proceedBtn, true);
    proceedBtn.onclick = () => (window.location.href = SIGNIN_URL);
  } else {
    setMsg(msg2, 'Still waiting for both steps. Be sure to click the Confirm link and enter the code.');
  }
});

// Helper to call check-status (supports GET then POST fallback)
async function checkStatus(email) {
  try {
    let res = await fetch(API('check-status') + `?email=${encodeURIComponent(email)}`);
    if (res.status === 405) {
      res = await fetch(API('check-status'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
    }
    const data = await res.json().catch(() => ({}));
    return {
      email: data.email || email,
      verified: !!data.verified,
      confirmed: !!data.confirmed,
      hasCredentials: !!data.hasCredentials
    };
  } catch {
    return { email, verified: false, confirmed: false, hasCredentials: false };
  }
}
