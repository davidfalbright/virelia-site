// ---- helpers ----
const $ = (id) => document.getElementById(id);
const API = (p) => `/.netlify/functions/${p}`;
const looksLikeEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || '').trim());
const normalizeCVC = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const formatCVC = (s) => (s.length === 6 ? `${s.slice(0,3)}-${s.slice(3)}` : s);
const isCVC = (s) => /^[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(s);
const nextTick = () => new Promise((r) => requestAnimationFrame(() => r()));

// Elements
const formCreate = $('createAccountForm');
const emailEl = $('email');
const passwordEl = $('password');
const createBtn = $('createAccountBtn');
const msg = $('msg');
const dbg = $('debug'); // optional <pre id="debug">

const verifyCard = $('verifyForm');
const codeEl = $('code');
const verifyBtn = $('verifyBtn');
const msg2 = $('msg2');
const resendLink = $('resendLink');
const refreshLink = $('refreshLink');
const proceedBtn = $('proceedBtn'); // <button type="button" id="proceedBtn" class="btn hidden">Go to Sign In</button>

// Destinations
const LANDING_URL = '/landing_page.html';
const SIGNIN_URL  = '/index.html';

// State
let lastStatus = { email: '', verified: false, confirmed: false, hasCredentials: false };
let codeVerified = false;

// Utils
function setMsg(el, text, ok = false) {
  if (!el) return;
  el.textContent = text;
  el.className = 'msg ' + (ok ? 'ok' : 'err');
}
function show(el, on = true) { el && el.classList.toggle('hidden', !on); }
function saveEmail(v) { try { localStorage.setItem('lastEmail', v); } catch {} }
function loadEmail() { try { return localStorage.getItem('lastEmail') || ''; } catch { return ''; } }
function debug(obj) { if (!dbg) return; try { dbg.textContent = JSON.stringify(obj, null, 2); } catch {} }
function setSessionToken(token) {
  try { localStorage.setItem('session_token', token); } catch {}
  document.cookie = `session_token=${encodeURIComponent(token)}; Max-Age=3600; Path=/; SameSite=Lax`;
}

// Read status
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

// Ask backend to copy/align status between stores, then re-check
async function syncAndStatus(email) {
  try {
    await fetch(API('sync-email-status') + `?email=${encodeURIComponent(email)}`).catch(() => {});
  } catch {}
  return checkStatus(email);
}

// Format code nicely
codeEl?.addEventListener('input', () => {
  const raw = normalizeCVC(codeEl.value);
  codeEl.value = formatCVC(raw);
});

// Prefill + hide verify section on load
window.addEventListener('DOMContentLoaded', () => {
  const saved = loadEmail();
  if (saved && emailEl && !emailEl.value) emailEl.value = saved;
  show(verifyCard, false);
});

// Create account → send code+link (does NOT create creds yet)
formCreate?.addEventListener('submit', async (e) => {
  e.preventDefault();
  setMsg(msg, ''); setMsg(msg2, ''); debug('');
  show(verifyCard, false);

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
      body: JSON.stringify({ email })
    });
    const data = await res.json().catch(() => ({}));
    debug({ status: res.status, data });

    if (!res.ok || data.ok === false) {
      show(verifyCard, false);
      return setMsg(msg, data.error || 'Failed to send verification email.');
    }

    setMsg(
      msg,
      'Email sent! Check your inbox (and spam). Click the Confirm link, then enter the 6-digit code below.',
      true
    );
    await nextTick();             // let message paint first
    show(verifyCard, true);       // then reveal verify card
    codeEl?.focus({ preventScroll: true });
    verifyCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    debug({ error: (err && err.message) || String(err) });
    show(verifyCard, false);
    setMsg(msg, 'Network error calling request-code.');
  } finally {
    createBtn.disabled = false;
    createBtn.textContent = 'Create Account';
  }
});

// Verify 6-digit code
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

    codeVerified = true;

    // Refresh status; if not aligned yet, sync then re-check
    lastStatus = await checkStatus(email);
    if (!lastStatus.verified || !lastStatus.confirmed) {
      lastStatus = await syncAndStatus(email);
    }

    if (lastStatus.confirmed && lastStatus.verified) {
      setMsg(msg2, 'Code verified and email confirmed. You may proceed.', true);
    } else if (lastStatus.verified && !lastStatus.confirmed) {
      setMsg(msg2, 'Code verified. Please click the email’s Confirm link to finish.');
    } else {
      setMsg(msg2, 'Still waiting for both steps. Use “Refresh status”.');
    }

    show(proceedBtn, true);
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

// Refresh status (after clicking email confirm link)
refreshLink?.addEventListener('click', async (e) => {
  e.preventDefault();
  const email = (emailEl.value || loadEmail() || '').trim();
  if (!looksLikeEmail(email)) return setMsg(msg2, 'Enter your email first.');
  // Try sync then read
  lastStatus = await syncAndStatus(email);
  if (lastStatus.confirmed && lastStatus.verified) {
    setMsg(msg2, 'Email confirmed and code verified. You may proceed.', true);
  } else if (lastStatus.verified && !lastStatus.confirmed) {
    setMsg(msg2, 'Code verified. Please click the email’s Confirm link to finish.');
  } else {
    setMsg(msg2, 'Still waiting for both steps. Be sure to click the Confirm link and enter the code.');
  }
  show(proceedBtn, true);
});

// Proceed: ensure verified+confirmed, ensure creds, login, then route
proceedBtn?.addEventListener('click', async (e) => {
  e.preventDefault();
  setMsg(msg2, '');

  const email = (emailEl.value || loadEmail() || '').trim();
  const password = (passwordEl.value || '').trim();
  if (!looksLikeEmail(email)) return setMsg(msg2, 'Enter your email above first.');

  // Always refresh/sync before gating
  lastStatus = await syncAndStatus(email);

  if (!lastStatus.verified || !lastStatus.confirmed) {
    // If UI already showed "Verified" from code, at least show the clearer message
    return setMsg(
      msg2,
      lastStatus.verified
        ? 'Code verified. Please click the email’s Confirm link to finish.'
        : 'Finish email Confirm + code verification first.'
    );
  }

  // Ensure credentials exist; create if missing
  if (!lastStatus.hasCredentials) {
    if (password.length < 8) {
      return setMsg(msg2, 'Enter a password (8+ chars) to create your account.');
    }
    setMsg(msg2, 'Creating your account…', true);
    const mk = await fetch(API('create-credentials'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const mkj = await mk.json().catch(() => ({}));
    if (!mk.ok && mk.status !== 409) {
      // 409 = already exists (OK)
      return setMsg(msg2, mkj.error || 'Could not create account.');
    }
    lastStatus.hasCredentials = true;
  }

  // Try to login now (auto-login if password present)
  if (!password) {
    // No password in form — send to sign-in page
    window.location.href = SIGNIN_URL;
    return;
  }

  setMsg(msg2, 'Signing you in…', true);
  const lr = await fetch(API('login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginId: email, password })
  });
  const lj = await lr.json().catch(() => ({}));
  if (!lr.ok || lj.ok === false || !lj.sessionToken) {
    setMsg(msg2, lj.error || 'Login failed. Redirecting to sign in…');
    setTimeout(() => (window.location.href = SIGNIN_URL), 900);
    return;
  }

  // Success → store token and go to landing
  setSessionToken(lj.sessionToken);
  window.location.href = LANDING_URL;
});
