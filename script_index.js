// ---- helpers ----
const $ = (id) => document.getElementById(id);
const API = (p) => `/.netlify/functions/${p}`;
const looksLikeEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s||'').trim());
const normalizeCVC = (s) => (s||'').toUpperCase().replace(/[^A-Z0-9]/g, '');
const formatCVC = (s) => s.length === 6 ? `${s.slice(0,3)}-${s.slice(3)}` : s;
const isCVC = (s) => /^[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(s);

const requestForm = $('requestForm'),
      verifyForm = $('verifyForm'),
      createCredsForm = $('createCredsForm'),
      loginForm = $('loginForm');

const emailEl = $('email'),
      codeEl  = $('code'),
      requestBtn = $('requestBtn'),
      verifyBtn  = $('verifyBtn'),
      createBtn  = $('createBtn'),
      loginBtn   = $('loginBtn');

const msg1 = $('msg1'), msg2 = $('msg2'), msg3 = $('msg3'), msg4 = $('msg4');
const sessionOut = $('sessionOut');
const resendLink = $('resendLink'), refreshLink = $('refreshLink'), showLoginLink = $('showLoginLink');
const usernameEl = $('username'), passwordEl = $('password'), loginIdEl = $('loginId'), loginPwdEl = $('loginPwd');

let pendingEmail = null;
let canCreateCreds = false;

// Generic fetch wrapper
async function call(path, method = 'GET', body) {
  const opts = { method, headers: {} };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch(API(path), opts);
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok || data.ok === false) throw data;
  return data;
}
function setMsg(el, text, ok=false) {
  if (!el) return;
  el.textContent = text;
  el.className = 'msg ' + (ok ? 'ok' : 'err');
}
function reveal(el, show=true){ el && el.classList.toggle('hidden', !show); }

// ---- UX niceties ----
codeEl?.addEventListener('input', () => {
  const raw = normalizeCVC(codeEl.value);
  codeEl.value = formatCVC(raw);
});

// ---- Step 1: request code + link ----
requestForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg1.textContent = '';
  const email = (emailEl.value || '').trim();
  if (!looksLikeEmail(email)) { setMsg(msg1, 'Please enter a valid email.'); return; }

  requestBtn.disabled = true; requestBtn.textContent = 'Sending…';
  try {
    const r = await call('request-code', 'POST', { email });

    // Remember email + that a request has happened
    localStorage.setItem('lastEmail', email);
    localStorage.setItem('lastEmailRequested', '1');

    pendingEmail = email;
    setMsg(msg1, r.message || `Email sent to ${email}. Click the Confirm link and enter the code.`, true);
    requestBtn.textContent = 'Sent!';

    // Make sure Verify is visible & focused when they return
    reveal(verifyForm, true);
    codeEl?.focus();
  } catch (err) {
    setMsg(msg1, err.error || err.message || 'Could not send email.');
    requestBtn.textContent = 'Email me the code + link';
    requestBtn.disabled = false;
  }
});

// ---- Step 2: verify code ----
verifyForm?.addEventListener('submit', async (e) => {
  e.preventDefault(); msg2.textContent = '';
  const raw = normalizeCVC(codeEl.value);
  const cvc = formatCVC(raw);
  if (!isCVC(cvc)) { setMsg(msg2, 'Enter the 6-character code like ABC-123.'); return; }
  if (!pendingEmail) pendingEmail = localStorage.getItem('lastEmail') || '';

  verifyBtn.disabled = true; verifyBtn.textContent = 'Verifying…';
  try {
    const r = await call('verify-code', 'POST', { email: pendingEmail, code: cvc });

    // Once verified we no longer need to nag them with the verify step
    if (r.confirmed) localStorage.removeItem('lastEmailRequested');

    const { hasCredentials, confirmed, canCreate } = r;
    canCreateCreds = !!canCreate || !!confirmed;

    const okText = confirmed
      ? 'Code verified and email confirmed. You may proceed.'
      : 'Code verified. Please click the Confirm link in your email to continue.';
    setMsg(msg2, r.message || okText, confirmed);

    verifyBtn.textContent = confirmed ? 'Verified' : 'Verified (awaiting confirm)';
    verifyBtn.disabled = confirmed;

    if (confirmed) {
      if (hasCredentials) {
        reveal(loginForm, true);
        loginIdEl.value = pendingEmail;
        loginPwdEl.focus();
      } else {
        reveal(createCredsForm, true);
        usernameEl.focus();
      }
    }
  } catch (err) {
    setMsg(msg2, err.error || err.message || 'Invalid or expired code. Please resend.');
    verifyBtn.textContent = 'Verify code';
    verifyBtn.disabled = false;
  }
});

// ---- Refresh status (after clicking email confirm link) ----
refreshLink?.addEventListener('click', async (e) => {
  e.preventDefault();
  if (!pendingEmail) pendingEmail = localStorage.getItem('lastEmail') || '';
  if (!pendingEmail) return setMsg(msg2, 'Enter your email first.');

  try {
    // prefer GET with query param; fall back to POST if 405
    let res = await fetch(API('check-status') + `?email=${encodeURIComponent(pendingEmail)}`);
    if (res.status === 405) {
      res = await fetch(API('check-status'), {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ email: pendingEmail })
      });
    }
    const data = await res.json();

    if (data.confirmed && data.verified) {
      localStorage.removeItem('lastEmailRequested');
      setMsg(msg2, 'Email confirmed and code verified — proceed.', true);
      if (data.hasCredentials) {
        reveal(loginForm, true); loginIdEl.value = pendingEmail; loginPwdEl.focus();
      } else {
        reveal(createCredsForm, true); usernameEl.focus();
      }
    } else {
      setMsg(msg2, data.message || 'Still waiting for both steps. Be sure to click the Confirm link and enter the code.');
    }
  } catch {
    setMsg(msg2, 'Status check failed.');
  }
});

// ---- Switch to login ----
showLoginLink?.addEventListener('click', (e) => {
  e.preventDefault();
  reveal(createCredsForm, false);
  reveal(loginForm, true);
  loginIdEl.value = pendingEmail || localStorage.getItem('lastEmail') || '';
  loginPwdEl.focus();
});

// ---- Step 3A: create credentials ----
createCredsForm?.addEventListener('submit', async (e) => {
  e.preventDefault(); msg3.textContent = '';
  if (!canCreateCreds) return setMsg(msg3, 'Please complete email Confirm + code first.');
  if (!pendingEmail) pendingEmail = localStorage.getItem('lastEmail') || '';

  const username = (usernameEl.value || '').trim();
  const password = (passwordEl.value || '').trim();
  if (!/^[a-zA-Z0-9._-]{3,20}$/.test(username)) return setMsg(msg3, 'Username must be 3–20 chars.');
  if (password.length < 8) return setMsg(msg3, 'Password must be at least 8 characters.');

  createBtn.disabled = true; createBtn.textContent = 'Creating…';
  try {
    const r = await call('create-credentials', 'POST', { email: pendingEmail, username, password });
    setMsg(msg3, r.message || 'Account created! You can now log in.', true);
    createBtn.textContent = 'Created';
    reveal(loginForm, true);
    loginIdEl.value = username;
    loginPwdEl.focus();
  } catch (err) {
    setMsg(msg3, err.error || err.message || 'Error creating account.');
    createBtn.textContent = 'Create account';
    createBtn.disabled = false;
  }
});

// ---- Step 3B: login ----
loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault(); msg4.textContent = '';
  const loginId = (loginIdEl.value || '').trim();
  const password = (loginPwdEl.value || '');
  if (!loginId || !password) return setMsg(msg4, 'Enter your username/email and password.');

  loginBtn.disabled = true; loginBtn.textContent = 'Logging in…';
  try {
    // send both username & email so backend can accept either
    const r = await call('login', 'POST', { username: loginId, email: loginId, password });
    const token = r.session || r.sessionToken;
    setMsg(msg4, 'Logged in!', true);
    loginBtn.textContent = 'Logged in';
    if (token) {
      localStorage.setItem('session_token', token);
      sessionOut.classList.remove('hidden');
      sessionOut.textContent = `session_token: ${token}`;
    }
  } catch (err) {
    setMsg(msg4, err.error || err.message || 'Invalid credentials.');
    loginBtn.textContent = 'Log in';
    loginBtn.disabled = false;
  }
});

// ---- On load: prefill + keep Verify visible after returning ----
window.addEventListener('DOMContentLoaded', async () => {
  const saved = localStorage.getItem('lastEmail');
  const requested = localStorage.getItem('lastEmailRequested') === '1';

  if (saved && emailEl && !emailEl.value) emailEl.value = saved;
  if (!pendingEmail && saved) pendingEmail = saved;

  // If a code was requested before, keep the Verify step visible and ready
  if (requested) {
    reveal(verifyForm, true);
    if (saved) setMsg(msg1, `Email sent to ${saved}. Click the Confirm link and enter the code.`, true);
    setTimeout(() => codeEl?.focus(), 0);
  }

  // If the URL contains ?token=... we *try* to confirm, but we don't rely on JSON.
  const token = new URLSearchParams(location.search).get('token');
  if (token) {
    try {
      const res = await fetch(API('confirm-email') + `?token=${encodeURIComponent(token)}`);
      // If confirm returns JSON we show it; if it returns HTML we just show Verify form.
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const data = await res.json();
        if (data.ok) setMsg(msg1, (data.message || 'Email confirmed') + (data.email ? ` for ${data.email}` : ''), true);
      }
    } catch {}
    reveal(verifyForm, true);
    setTimeout(() => codeEl?.focus(), 0);
  }
});

// ---- Resend shortcut ----
resendLink?.addEventListener('click', (e) => {
  e.preventDefault();
  requestBtn.disabled = false;
  requestBtn.textContent = 'Email me the code + link';
  requestForm?.dispatchEvent(new Event('submit'));
});
