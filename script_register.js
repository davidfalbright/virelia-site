// ---- helpers ----
const $ = (id) => document.getElementById(id);
const API = (p) => `/.netlify/functions/${p}`;
const looksLikeEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || '').trim());

const form = $('createAccountForm');
const emailEl = $('email');
const passwordEl = $('password');
const createBtn = $('createAccountBtn');
const msgEl = $('msg');
const dbgEl = $('debug');

function setMsg(el, text, ok = false) {
  if (!el) return;
  el.textContent = text;
  el.className = 'msg ' + (ok ? 'ok' : 'err');
}

function showDebug(obj) {
  try { dbgEl.textContent = JSON.stringify(obj, null, 2); } catch {}
}

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  setMsg(msgEl, '');
  showDebug('');

  const email = (emailEl.value || '').trim();
  const password = (passwordEl.value || '').trim();

  if (!looksLikeEmail(email)) return setMsg(msgEl, 'Please enter a valid email.');
  if (password.length < 8) return setMsg(msgEl, 'Password must be at least 8 characters.');

  // persist email for later steps
  try { localStorage.setItem('lastEmail', email); } catch {}

  createBtn.disabled = true;
  createBtn.textContent = 'Sending…';

  try {
    // this only sends the email (code + confirm link) and stores the code hash
    const res = await fetch(API('request-code'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })   // password is NOT needed for request-code
    });

    const data = await res.json().catch(() => ({}));
    showDebug({ status: res.status, data });

    if (!res.ok || data.ok === false) {
      return setMsg(msgEl, data.error || 'Failed to send verification email.');
    }

    setMsg(
      msgEl,
      'Email sent! Check your inbox (and spam). Click the Confirm link, then enter the 6-digit code on the sign-in page.',
      true
    );
    createBtn.textContent = 'Create Account';
  } catch (err) {
    showDebug({ error: (err && err.message) || String(err) });
    setMsg(msgEl, 'Network error calling request-code.');
  } finally {
    createBtn.disabled = false;
  }
});
