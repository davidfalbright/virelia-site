// ---- helpers ----
const $ = (id) => document.getElementById(id);
const API = (p) => `/.netlify/functions/${p}`;
const looksLikeEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || '').trim());
const normalizeCVC = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const formatCVC = (s) => (s.length === 6 ? `${s.slice(0, 3)}-${s.slice(3)}` : s);
const isCVC = (s) => /^[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(s);

const requestForm = $('requestForm'),
  verifyForm = $('verifyForm'),
  createCredsForm = $('createCredsForm'),
  loginForm = $('loginForm');

const emailEl = $('email'),
  codeEl = $('code'),
  requestBtn = $('requestBtn'),
  verifyBtn = $('verifyBtn'),
  createBtn = $('createBtn'),
  loginBtn = $('loginBtn');

const msg1 = $('msg1'),
  msg2 = $('msg2'),
  msg3 = $('msg3'),
  msg4 = $('msg4');

const sessionOut = $('sessionOut');
const resendLink = $('resendLink'),
  refreshLink = $('refreshLink'),
  showLoginLink = $('showLoginLink');

const usernameEl = $('username'),           // may or may not exist in your HTML
  passwordEl = $('password'),               // create-account password
  loginIdEl = $('loginId'),
  loginPwdEl = $('loginPwd');

const LOGIN_DEST = '/landing_page.html';

let pendingEmail = null;
let canCreateCreds = false;
let confirmedViaLink = false; // set true if ?token=... confirmed

// Generic fetch wrapper
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

// ---------- small UI helpers (button, dividers, labels) ----------
function ensureProceedButton(text = 'Log in', href = LOGIN_DEST) {
  let btn = $('proceedLoginBtn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'proceedLoginBtn';
    btn.type = 'button';
    btn.className = 'btn';
    // place inside verify form for visibility
    (verifyForm || document.body).appendChild(btn);
  }
  btn.textContent = text;
  btn.onclick = () => (window.location.href = href);
  btn.classList.remove('hidden');

  // Divider directly under the button
  ensureDivider('dividerAfterProceed', btn, 'afterend');
}

function ensureDivider(id, anchorEl, where = 'afterend') {
  if (!anchorEl) return;
  if ($(id)) return;
  const hr = document.createElement('hr');
  hr.id = id;
  hr.style.border = 'none';
  hr.style.borderTop = '1px solid rgba(255,255,255,0.15)';
  hr.style.margin = '18px 0';
  anchorEl.insertAdjacentElement(where, hr);
}

function ensurePasswordLabel() {
  if (!passwordEl || $('passwordLabel')) return;
  const label = document.createElement('label');
  label.id = 'passwordLabel';
  label.textContent = 'Password';
  label.style.display = 'block';
  label.style.margin = '16px 0 6px';
  label.style.color = '#cbd5e1';
  passwordEl.insertAdjacentElement('beforebegin', label);
}

function ensureCreateSectionDivider() {
  // Put a line under the create-account area
  if (createCredsForm) ensureDivider('dividerUnderCreate', createCredsForm, 'afterend');
}

// Decide proceed button text
function updateProceedButton(hasCredentials) {
  ensureProceedButton(hasCredentials ? 'Log in' : 'Guest Login', LOGIN_DEST);
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
    setMsg(msg1, r.message || `Email sent to ${email}. Click the Confirm link and enter the code.`, true);
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

    const isReallyConfirmed =
      !!confirmed || confirmedViaLink || localStorage.getItem('confirmed_ok') === '1';

    if (isReallyConfirmed) {
      setMsg(msg2, r.message || 'Code verified and email confirmed. You may proceed.', true);
      verifyBtn.textContent = 'Verified';
      verifyBtn.disabled = true;

      // Proceed + UI polish
      updateProceedButton(!!hasCredentials);
      ensurePasswordLabel();
      ensureCreateSectionDivider();

      if (hasCredentials) {
        reveal(loginForm, true);
        if (loginIdEl) loginIdEl.value = pendingEmail;
      } else {
        reveal(createCredsForm, true);
        // If a username field exists in the markup, prefill with email (but we won't validate it)
        if (usernameEl) usernameEl.value = pendingEmail;
      }
    } else {
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
      updateProceedButton(!!data.hasCredentials);
      ensurePasswordLabel();
      ensureCreateSectionDivider();

      if (data.hasCredentials) {
        reveal(loginForm, true);
        if (loginIdEl) { loginIdEl.value = pendingEmail; loginPwdEl?.focus(); }
      } else {
        reveal(createCredsForm, true);
        passwordEl?.focus();
      }
    } else {
      setMsg(
        msg2,
        data.message || 'Still waiting for both steps. Be sure to click the Confirm link and enter the code.'
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
  if (loginIdEl) loginIdEl.value = pendingEmail || localStorage.getItem('lastEmail') || '';
  loginPwdEl?.focus();
});

// ---- Step 3A: create credentials (email is the account id) ----
createCredsForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg3.textContent = '';
  if (!canCreateCreds) return setMsg(msg3, 'Please complete email Confirm + code first.');
  if (!pendingEmail) pendingEmail = localStorage.getItem('lastEmail') || '';

  const emailId = (pendingEmail || '').trim();
  const password = (passwordEl?.value || '').trim();

  if (!looksLikeEmail(emailId)) return setMsg(msg3, 'Please enter a valid email first.');
  if (password.length < 8) return setMsg(msg3, 'Password must be at least 8 characters.');

  createBtn.disabled = true;
  createBtn.textContent = 'Creating…';
  try {
    // Send username = email for server compatibility
    const r = await call('create-credentials', 'POST', {
      email: emailId,
      username: emailId,
      password
    });
    setMsg(msg3, r.message || 'Account created! You can now log in.', true);
    createBtn.textContent = 'Created';

    reveal(loginForm, true);
    if (loginIdEl) loginIdEl.value = emailId;
    loginPwdEl?.focus();

    // Update the proceed button to “Log in” after creation
    updateProceedButton(true);
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
  const loginId = (loginIdEl?.value || '').trim();
  const password = (loginPwdEl?.value || '');
  if (!loginId || !password) return setMsg(msg4, 'Enter your username/email and password.');

  loginBtn.disabled = true;
  loginBtn.textContent = 'Logging in…';
  try {
    // accept either username or email; we pass both
    const r = await call('login', 'POST', { username: loginId, email: loginId, password });
    const token = r.session || r.sessionToken;
    setMsg(msg4, 'Logged in!', true);
    loginBtn.textContent = 'Logged in';
    if (token) {
      localStorage.setItem('session_token', token);
      sessionOut?.classList.remove('hidden');
      if (sessionOut) sessionOut.textContent = `session_token: ${token}`;
    }
    // optional redirect after login:
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

  // Helpful UI tweaks present from the start
  ensurePasswordLabel();
  ensureCreateSectionDivider();

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
      setMsg(msg1, (data.message || 'Email confirmed') + (data.email ? ` for ${data.email}` : ''), true);
      reveal(verifyForm, true);

      // If the token response includes hasCredentials, update the proceed button text
      if (typeof data.hasCredentials === 'boolean') {
        updateProceedButton(data.hasCredentials);
      }
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
