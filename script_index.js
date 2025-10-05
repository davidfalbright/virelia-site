// ---- helpers ----
const $ = (id) => document.getElementById(id);
const API = (p) => `/.netlify/functions/${p}`;
const looksLikeEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || '').trim());
const normalizeCVC = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const formatCVC = (s) => (s.length === 6 ? `${s.slice(0, 3)}-${s.slice(3)}` : s);
const isCVC = (s) => /^[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(s);

const requestForm     = $('requestForm'),
      verifyForm      = $('verifyForm'),
      createCredsForm = $('createCredsForm'),
      loginForm       = $('loginForm');

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

const usernameEl = $('username'),   // hidden & forced to email
      passwordEl = $('password'),
      loginIdEl  = $('loginId'),    // hidden & forced to email
      loginPwdEl = $('loginPwd');

const LOGIN_DEST = '/landing_page.html';

let pendingEmail     = null;
let canCreateCreds   = false;
let confirmedViaLink = false;

// ---------- fetch wrapper ----------
async function call(path, method = 'GET', body) {
  const opts = { method, headers: {} };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
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

function reveal(el, show = true) { el && el.classList.toggle('hidden', !show); }

// ---------- Proceed button ----------
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
function setProceedLabel(hasCreds) {
  const btn = getOrCreateProceedBtn();
  btn.textContent = hasCreds ? 'Log in' : 'Guest Login';
}

// ---------- Small DOM helpers for your UI polish ----------
function insertAfter(refNode, newNode) {
  if (!refNode || !refNode.parentNode) return;
  refNode.parentNode.insertBefore(newNode, refNode.nextSibling);
}
function ensureDivider(id, afterEl) {
  if (!afterEl) return;
  let hr = $(id);
  if (!hr) {
    hr = document.createElement('hr');
    hr.id = id;
    hr.className = 'ui-divider';
    insertAfter(afterEl, hr);
  }
  hr.classList.remove('hidden');
}
function ensurePasswordLabel() {
  if (!passwordEl) return;
  let lbl = $('passwordLabel');
  if (!lbl) {
    lbl = document.createElement('label');
    lbl.id = 'passwordLabel';
    lbl.className = 'ui-label';
    lbl.setAttribute('for', 'password');
    lbl.textContent = 'Password';
    // put it right before the password input
    passwordEl.parentNode.insertBefore(lbl, passwordEl);
  }
  lbl.classList.remove('hidden');
}

// Place dividers/label when appropriate
function updateChrome(hasCredentials) {
  // Divider right under the Guest Login / Log in button
  const proceedBtn = getOrCreateProceedBtn();
  setProceedLabel(!!hasCredentials);
  ensureDivider('dividerAfterProceed', proceedBtn);

  // Label for the create-account password
  ensurePasswordLabel();

  // Divider just below the "Create account" area (after the submit button)
  if (createBtn) ensureDivider('dividerAfterCreate', createBtn);
}

// ---------- Force UID == Email (hide inputs) ----------
function useEmailAsUid() {
  if (!pendingEmail) return;
  if (usernameEl) {
    usernameEl.value = pendingEmail;
    try { usernameEl.type = 'hidden'; } catch {}
    usernameEl.classList.add('hidden');
  }
  if (loginIdEl) {
    loginIdEl.value = pendingEmail;
    try { loginIdEl.type = 'hidden'; } catch {}
    loginIdEl.classList.add('hidden');
  }
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
  if (!looksLikeEmail(email)) return setMsg(msg1, 'Please enter a valid email.');

  requestBtn.disabled = true; requestBtn.textContent = 'Sending…';
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
  e.preventDefault(); msg2.textContent = '';
  const raw = normalizeCVC(codeEl.value);
  const cvc = formatCVC(raw);
  if (!isCVC(cvc)) return setMsg(msg2, 'Enter the 6-character code like ABC-123.');
  if (!pendingEmail) pendingEmail = localStorage.getItem('lastEmail') || '';

  verifyBtn.disabled = true; verifyBtn.textContent = 'Verifying…';
  try {
    const r = await call('verify-code', 'POST', { email: pendingEmail, code: cvc });
    const { hasCredentials, confirmed, canCreate } = r;
    canCreateCreds = !!canCreate || !!confirmed;

    const isReallyConfirmed =
      !!confirmed || confirmedViaLink || localStorage.getItem('confirmed_ok') === '1';

    if (isReallyConfirmed) {
      setMsg(msg2, r.message || 'Code verified. You’re all set.', true);
      verifyBtn.textContent = 'Verified'; verifyBtn.disabled = true;

      useEmailAsUid();
      reveal(loginForm, !!hasCredentials);
      reveal(createCredsForm, !hasCredentials);

      updateChrome(!!hasCredentials);
    } else {
      setMsg(msg2, r.message || 'Code verified. Please click the Confirm link in your email to continue.');
      verifyBtn.textContent = 'Verify code'; verifyBtn.disabled = false;
    }
  } catch (err) {
    setMsg(msg2, err.error || err.message || 'Invalid or expired code. Please resend.');
    verifyBtn.textContent = 'Verify code'; verifyBtn.disabled = false;
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
      useEmailAsUid();
      reveal(loginForm, !!data.hasCredentials);
      reveal(createCredsForm, !data.hasCredentials);

      updateChrome(!!data.hasCredentials);
      if (data.hasCredentials) loginPwdEl.focus(); else passwordEl?.focus();
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
  if (!pendingEmail) pendingEmail = localStorage.getItem('lastEmail') || '';
  useEmailAsUid();
  updateChrome(true);
  loginPwdEl.focus();
});

// ---- Step 3A: create credentials (UID = email) ----
createCredsForm?.addEventListener('submit', async (e) => {
  e.preventDefault(); msg3.textContent = '';
  if (!canCreateCreds) return setMsg(msg3, 'Please complete email Confirm + code first.');
  if (!pendingEmail) pendingEmail = localStorage.getItem('lastEmail') || '';

  const username = pendingEmail;                 // UID == email
  const password = (passwordEl.value || '').trim();
  if (password.length < 8) return setMsg(msg3, 'Password must be at least 8 characters.');

  createBtn.disabled = true; createBtn.textContent = 'Creating…';
  try {
    const r = await call('create-credentials', 'POST', { email: pendingEmail, username, password });
    setMsg(msg3, r.message || 'Account created! You can now log in.', true);
    createBtn.textContent = 'Created';

    reveal(loginForm, true); reveal(createCredsForm, false);
    loginIdEl.value = pendingEmail;
    updateChrome(true);
    loginPwdEl.focus();
  } catch (err) {
    setMsg(msg3, err.error || err.message || 'Error creating account.');
    createBtn.textContent = 'Create account'; createBtn.disabled = false;
  }
});

// ---- Step 3B: login (UID = email) ----
loginForm?.addEventListener('submit', async (
