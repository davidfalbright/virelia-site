// ---- helpers ----
const $ = (id) => document.getElementById(id);
const API = (p) => `/.netlify/functions/${p}`;
const looksLikeEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || '').trim());
const normalizeCVC = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const formatCVC = (s) => (s.length === 6 ? `${s.slice(0, 3)}-${s.slice(3)}` : s);
const isCVC = (s) => /^[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(s);

const requestForm   = $('requestForm'),
      verifyForm    = $('verifyForm'),
      createCredsForm = $('createCredsForm'),
      loginForm     = $('loginForm');

const emailEl   = $('email'),
      codeEl    = $('code'),
      requestBtn= $('requestBtn'),
      verifyBtn = $('verifyBtn'),
      createBtn = $('createBtn'),
      loginBtn  = $('loginBtn');

const msg1 = $('msg1'),
      msg2 = $('msg2'),
      msg3 = $('msg3'),
      msg4 = $('msg4');

const sessionOut    = $('sessionOut');
const resendLink    = $('resendLink'),
      refreshLink   = $('refreshLink'),
      showLoginLink = $('showLoginLink');

const usernameEl = $('username'),
      passwordEl = $('password'),
      loginIdEl  = $('loginId'),
      loginPwdEl = $('loginPwd');

const LOGIN_DEST = '/landing_page.html';

let pendingEmail     = null;
let canCreateCreds   = false;
let confirmedViaLink = false;

// ---------- fetch wrapper ----------
async function call(path, method = 'GET', body) {
  const opts = { method, headers: {} };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(API(path), opts);
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok || data.ok === false) throw data;
  return data;
}

function setMsg(el, text, ok = false) {
  if (!el) return;
  el.textContent = text;
  el.className = 'msg ' + (ok ? 'ok' : 'err');
}

function reveal(el, show = true) {
  el && el.classList.toggle('hidden', !show);
}

// ---------- Proceed button utilities ----------
function getOrCreateProceedBtn() {
  let btn = document.getElementById('proceedLoginBtn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'proceedLoginBtn';
    btn.type = 'button';
    btn.className = 'btn';
    btn.onclick = () => (window.location.href = LOGIN_DEST);
    (verifyForm || document.body).appendChild(btn);
  }
  btn.classList.remove('hidden');
  return btn;
}

// Set the big button label based on whether the user already has credentials
function setProceedLabel(hasCreds) {
  const btn = getOrCreateProceedBtn();
  btn.textContent = hasCreds ? 'Log in' : 'Guest Login';
}

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
  if (!looksLikeEmail(email)) {
    setMsg(msg1, 'Please enter a valid email.');
    return;
  }

  requestBtn.disabled = true;
  requestBtn.textContent = 'Sending…';
  try {
    const r = await call('request-code', 'POST', { email });
    localStorage.setItem('lastEmail', email);
    pendingEmail = email;
    setMsg(
      msg1,
      r.message || `Email sent to ${email}. Click the Confirm link and enter the code.`,
      true
    );
    requestBtn.textContent = 'Sent!';
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
  e.preventDefault();
  msg2.textContent = '';
  const raw = normalizeCVC(codeEl.value);
  const cvc = formatCVC(raw);
  if (!isCVC(cvc)) {
    setMsg(msg2, 'Enter the 6-character code like ABC-123.');
    return;
  }
  if (!pendingEmail) pendingEmail = localStorage.getItem('lastEmail') || '';

  verifyBtn.disabled = true;
  verifyBtn.textContent = 'Verifying…';
  try {
    const r = await call('verify-code', 'POST', { email: pendingEmail, code: cvc });
    const { hasCredentials, confirmed, canCreate } = r;
    canCreateCreds = !!canCreate || !!confirmed;

    // Also accept a prior link-click as confirmation
    const isReallyConfirmed =
      !!confirmed || confirmedViaLink || localStorage.getItem('confirmed_ok') === '1';

    if (isReallyConfirmed) {
      setMsg(msg2, r.message || 'Code verified. You’re all set.', true);
      verifyBtn.textContent = 'Verified';
      verifyBtn.disabled = true;

      // Update the proceed button label based on account state
      setProceedLabel(!!hasCredentials);

      // Optionally expose log-in/create forms too
      if (hasCredentials) {
        reveal(loginForm, true);
        loginIdEl.value = pendingEmail;
      } else {
        reveal(createCredsForm, true);
      }
    } else {
      // Not confirmed yet
      const okText = 'Code verified. Please click the Confirm link in your email to continue.';
      setMsg(msg2, r.message || okText, false);
      verifyBtn.textContent = 'Verify code';
      verifyBtn.disabled = false;
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail })
      });
    }
    const data = await res.json();

    if (data.confirmed && data.verified) {
      setMsg(msg2, 'Email confirmed and code verified — proceed.', true);

      // Update label -> Log in / Guest Login
      setProceedLabel(!!data.hasCredentials);

      if (data.hasCredentials) {
        reveal(loginForm, true);
        loginIdEl.value = pendingEmail;
        loginPwdEl.focus();
      } else {
        reveal(createCredsForm, true);
        usernameEl.focus();
      }
    } else {
      setMsg(
        msg2,
        data.message ||
          'Still waiting for both steps. Be sure to click the Confirm link and enter the code.'
      );
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
  e.preventDefault();
  msg3.textContent = '';
  if (!canCreateCreds) return setMsg(msg3, 'Please complete email Confirm + code first.');
  if (!pendingEmail) pendingEmail = localStorage.getItem('lastEmail') || '';

  const username = (usernameEl.value || '').trim();
  const password = (passwordEl.value || '').trim();
  if (!/^[a-zA-Z0-9._-]{3,20}$/.test(username)) return setMsg(msg3, 'Username must be 3–20 chars.');
  if (password.length < 8) return setMsg(msg3, 'Password must be at least 8 characters.');

  createBtn.disabled = true;
  createBtn.textContent = 'Creating…';
  try {
    const r = await call('create-credentials', 'POST', { email: pendingEmail, username, password });
    setMsg(msg3, r.message || 'Account created! You can now log in.', true);
    createBtn.textContent = 'Created';
    reveal(loginForm, true);
    loginIdEl.value = username;
    loginPwdEl.focus();

    // Now that creds exist, flip the big button label to "Log in"
    setProceedLabel(true);
  } catch (err) {
    setMsg(msg3, err.error || err.message || 'Error creating account.');
    createBtn.textContent = 'Create account';
    createBtn.disabled = false;
  }
});

// ---- Step 3B: login ----
loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg4.textContent = '';
  const loginId = (loginIdEl.value || '').trim();
  const password = loginPwdEl.value || '';
  if (!loginId || !password) return setMsg(msg4, 'Enter your username/email and password.');

  loginBtn.disabled = true;
  loginBtn.textContent = 'Logging in…';
  try {
    const r = await call('login', 'POST', { username: loginId, email: loginId, password });
    const token = r.session || r.sessionToken;
    setMsg(msg4, 'Logged in!', true);
    loginBtn.textContent = 'Logged in';
    if (token) {
      localStorage.setItem('session_token', token);
      sessionOut.classList.remove('hidden');
      sessionOut.textContent = `session_token: ${token}`;
    }
    // Optionally redirect after login:
    // window.location.href = LOGIN_DEST;
  } catch (err) {
    setMsg(msg4, err.error || err.message || 'Invalid credentials.');
    loginBtn.textContent = 'Log in';
    loginBtn.disabled = false;
  }
});

// ---- On load: prefill + auto-confirm ?token=... ----
window.addEventListener('DOMContentLoaded', async () => {
  const saved = localStorage.getItem('lastEmail');
  if (saved && emailEl && !emailEl.value) emailEl.value = saved;
  if (!pendingEmail && saved) pendingEmail = saved;

  const token = new URLSearchParams(location.search).get('token');
  if (!token) return;

  try {
    const res = await fetch(API('confirm-email') + `?token=${encodeURIComponent(token)}`);
    const data = await res.json();
    if (data.ok) {
      confirmedViaLink = true;
      localStorage.setItem('confirmed_ok', '1');
      if (data.email) {
        pendingEmail = data.email;
        localStorage.setItem('lastEmail', data.email);
        if (emailEl) emailEl.value = data.email;
      }
      setMsg(
        msg1,
        (data.message || 'Email confirmed') + (data.email ? ` for ${data.email}` : ''),
        true
      );
      reveal(verifyForm, true);
    } else {
      setMsg(msg1, data.error || 'Confirmation failed.');
    }
  } catch {
    setMsg(msg1, 'Confirmation failed.');
  }
});

// ---- Resend shortcut ----
resendLink?.addEventListener('click', (e) => {
  e.preventDefault();
  requestBtn.disabled = false;
  requestBtn.textContent = 'Email me the code + link';
  requestForm?.dispatchEvent(new Event('submit'));
});
