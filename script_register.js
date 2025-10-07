// ---- helpers ----
const $ = (id) => document.getElementById(id);
const API = (p) => `/.netlify/functions/${p}`;
const looksLikeEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || '').trim());
const normalizeCVC = (s = '') => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
const formatCVC = (s = '') => (s.length === 6 ? `${s.slice(0, 3)}-${s.slice(3)}` : s);

function setMsg(el, text, ok = false) {
  if (!el) return;
  el.textContent = text || '';
  el.className = 'msg ' + (ok ? 'ok' : text ? 'err' : '');
}

function show(el, on = true) {
  if (!el) return;
  if (on) {
    el.classList.remove('hidden');
    el.removeAttribute('hidden');
  } else {
    el.classList.add('hidden');
    el.setAttribute('hidden', '');
  }
}

const nextTick = () => new Promise((r) => setTimeout(r, 0));

// ---- elements ----
const form = $('createAccountForm');
const emailEl = $('email');
const passwordEl = $('password');
const createAccountBtn = $('createAccountBtn');
const msg = $('msg');

const verifyCard = $('verifyForm');
const codeEl = $('code');
const verifyBtn = $('verifyBtn');
const msg2 = $('msg2');
const resendLink = $('resendLink');
const refreshLink = $('refreshLink');

const goBtn = $('goBtn');
const msg3 = $('msg3');

const LOGIN_PAGE = '/index.html';
const LANDING_PAGE = '/landing_page.html'; // final destination after auto-login

// state
let pendingEmail = '';
let pendingPassword = '';
let statusCache = { verified: false, confirmed: false, hasCredentials: false };

// ---- input nicety: auto-format code ----
codeEl?.addEventListener('input', () => {
  const raw = normalizeCVC(codeEl.value);
  codeEl.value = formatCVC(raw);
});

// ---- on load: ensure verify section is hidden, restore email if present, handle ?token auto-confirm ----
window.addEventListener('DOMContentLoaded', async () => {
  show(verifyCard, false);

  const saved = localStorage.getItem('lastEmail');
  if (saved && !emailEl.value) emailEl.value = saved;

  const token = new URLSearchParams(location.search).get('token');
  if (token) {
    try {
      const r = await fetch(API('confirm-email') + `?token=${encodeURIComponent(token)}`);
      const data = await r.json().catch(() => ({}));
      if (r.ok && data && (data.ok || !data.error)) {
        // store a local hint that confirm happened
        localStorage.setItem('confirmed_ok', '1');
        if (data.email && !emailEl.value) emailEl.value = data.email;
        setMsg(msg, (data.message || 'Email confirmed.') + (data.email ? ` for ${data.email}` : ''), true);
        show(verifyCard, true);
      } else {
        setMsg(msg, data.error || 'Confirmation failed.');
      }
    } catch {
      setMsg(msg, 'Confirmation failed.');
    }
  }
});

// ---- Create Account -> send code + confirm link ----
form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  setMsg(msg, '');
  const email = (emailEl.value || '').trim();
  const pwd = (passwordEl.value || '').trim();

  if (!looksLikeEmail(email)) return setMsg(msg, 'Please enter a valid email.');
  if (pwd.length < 8) return setMsg(msg, 'Password must be at least 8 characters.');

  createAccountBtn.disabled = true;
  createAccountBtn.textContent = 'Sending…';
  try {
    const res = await fetch(API('request-code'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.error || 'Failed to send email.');

    pendingEmail = email;
    pendingPassword = pwd;
    localStorage.setItem('lastEmail', email);

    setMsg(
      msg,
      'Email sent! Check your inbox (and spam). Click the Confirm link, then enter the 6-digit code below.',
      true
    );
    await nextTick();
    show(verifyCard, true);
    codeEl?.focus({ preventScroll: true });
  } catch (err) {
    setMsg(msg, err.message || 'Could not send email.');
  } finally {
    createAccountBtn.textContent = 'Create Account';
    createAccountBtn.disabled = false;
  }
});

// ---- Verify code ----
verifyBtn?.addEventListener('click', async () => {
  setMsg(msg2, '');
  const email = (emailEl.value || '').trim();
  const raw = normalizeCVC(codeEl.value || '');
  const code = formatCVC(raw);

  if (!looksLikeEmail(email)) return setMsg(msg2, 'Enter a valid email in the form above.');
  if (!/^[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(code)) return setMsg(msg2, 'Enter the code like ABC-DEF.');

  verifyBtn.disabled = true;
  verifyBtn.textContent = 'Verifying…';
  try {
    const r = await fetch(API('verify-code'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.ok === false) throw new Error(data.error || 'Invalid or expired code.');

    // Track status
    statusCache.verified = !!(data.verified || data.ok);
    statusCache.confirmed =
      !!data.confirmed || localStorage.getItem('confirmed_ok') === '1';
    statusCache.hasCredentials = !!data.hasCredentials;

    if (statusCache.verified) {
      setMsg(msg2, 'Code verified.' + (statusCache.confirmed ? ' You may proceed.' : ' Please click the Confirm link in your email.'), true);
    } else {
      setMsg(msg2, data.message || 'Code not verified.');
    }

    goBtn.disabled = !(statusCache.verified && statusCache.confirmed);
  } catch (err) {
    setMsg(msg2, err.message || 'Verification failed.');
  } finally {
    verifyBtn.textContent = 'Verify code';
    verifyBtn.disabled = false;
  }
});

// ---- Resend ----
resendLink?.addEventListener('click', async (e) => {
  e.preventDefault();
  setMsg(msg2, '');
  const email = (emailEl.value || '').trim();
  if (!looksLikeEmail(email)) return setMsg(msg2, 'Enter a valid email above.');
  try {
    const r = await fetch(API('request-code'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.ok === false) throw new Error(data.error || 'Failed to resend.');
    setMsg(msg2, 'Email re-sent. Check your inbox (and spam).', true);
    show(verifyCard, true);
  } catch (err) {
    setMsg(msg2, err.message || 'Resend failed.');
  }
});

// ---- Refresh status (after clicking confirm link) ----
refreshLink?.addEventListener('click', async (e) => {
  e.preventDefault();
  const email = (emailEl.value || '').trim();
  if (!looksLikeEmail(email)) return setMsg(msg2, 'Enter a valid email above.');
  try {
    // GET first for convenience; some environments need POST fallback
    let res = await fetch(API('check-status') + `?email=${encodeURIComponent(email)}`);
    if (res.status === 405) {
      res = await fetch(API('check-status'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
    }
    const data = await res.json().catch(() => ({}));
    statusCache.verified = !!data.verified;
    statusCache.confirmed = !!data.confirmed;
    statusCache.hasCredentials = !!data.hasCredentials;

    if (statusCache.verified && statusCache.confirmed) {
      setMsg(msg2, 'Email confirmed and code verified — you may proceed.', true);
      goBtn.disabled = false;
    } else {
      setMsg(msg2, data.message || 'Still waiting for both steps.');
      goBtn.disabled = true;
    }
  } catch {
    setMsg(msg2, 'Status check failed.');
  }
});

// ---- Go to Sign In -> ensure creds exist -> login -> redirect to landing ----
goBtn?.addEventListener('click', async () => {
  setMsg(msg3, '');
  const email = (emailEl.value || '').trim();
  const pwd = (passwordEl.value || '').trim();
  if (!looksLikeEmail(email)) return setMsg(msg3, 'Enter a valid email.');
  if (!statusCache.verified || !statusCache.confirmed) {
    return setMsg(msg3, 'Finish email Confirm + code verification first.');
  }

  goBtn.disabled = true;
  goBtn.textContent = 'Checking…';

  try {
    // If the email doesn’t yet have credentials, create them now
    if (!statusCache.hasCredentials) {
      const r = await fetch(API('create-credentials'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pwd })
      });
      if (r.status === 409) {
        // already exists — ok to proceed
        statusCache.hasCredentials = true;
      } else {
        const data = await r.json().catch(() => ({}));
        if (!r.ok || data.ok === false) throw new Error(data.error || 'Could not create account.');
        statusCache.hasCredentials = true;
      }
    }

    // Login right away
    const r2 = await fetch(API('login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginId: email, password: pwd })
    });
    const data2 = await r2.json().catch(() => ({}));
    if (!r2.ok || data2.ok === false || !data2.sessionToken) {
      throw new Error(data2.error || 'Login failed.');
    }

    // store session and redirect
    try { localStorage.setItem('session_token', data2.sessionToken); } catch {}
    document.cookie = `session_token=${encodeURIComponent(data2.sessionToken)}; Path=/; SameSite=Lax`;
    location.replace(LANDING_PAGE);
  } catch (err) {
    setMsg(msg3, err.message || 'Could not continue.');
    goBtn.disabled = false;
    goBtn.textContent = 'Go to Sign In';
  }
});
