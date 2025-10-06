// script_login.js
const API = (p) => `/.netlify/functions/${p}`;
const LOGIN_DEST = '/landing_page.html';

const loginForm = document.getElementById('loginForm');
const loginEmail = document.getElementById('loginEmail');
const loginPwd   = document.getElementById('loginPwd');
const loginBtn   = document.getElementById('loginBtn');
const loginMsg   = document.getElementById('loginMsg');

const guestBtn = document.getElementById('guestBtn');
const guestMsg = document.getElementById('guestMsg');

function setMsg(el, text, ok=false){ if(!el) return; el.textContent = text || ''; el.className = 'msg ' + (ok ? 'ok' : 'err'); }
function clear(el){ setMsg(el, ''); }

function readToken(){
  try{ const t = localStorage.getItem('session_token'); if(t) return t; }catch{}
  const m = document.cookie.match(/(?:^|;\s*)session_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
function parseJwtPayload(jwt){
  const parts = (jwt||'').split('.');
  if(parts.length<2) return null;
  try{
    const b64 = parts[1].replace(/-/g,'+').replace(/_/g,'/');
    return JSON.parse(atob(b64));
  }catch{ return null; }
}
function saveToken(token){
  try{ localStorage.setItem('session_token', token); }catch{}
  document.cookie = `session_token=${encodeURIComponent(token)}; Path=/; SameSite=Lax`;
}
function redirect(){ window.location.href = LOGIN_DEST; }

// Auto-redirect if already logged in & not expired
window.addEventListener('DOMContentLoaded', () => {
  const t = readToken();
  const p = parseJwtPayload(t) || {};
  const exp = typeof p.exp === 'number' ? p.exp : 0;
  if(t && Date.now() < exp){ redirect(); }
});

async function call(path, body){
  const res = await fetch(API(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body||{})
  });
  const data = await res.json().catch(()=>({}));
  if(!res.ok || data.ok === false) throw data;
  return data;
}

// Handle email/password login
loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  clear(loginMsg);

  const email = (loginEmail.value||'').trim();
  const pwd   = (loginPwd.value||'');

  if(!email || !pwd){ return setMsg(loginMsg, 'Missing loginId or password'); }

  loginBtn.disabled = true;
  loginBtn.textContent = 'Logging in…';

  try{
    const r = await call('login', { loginId: email, password: pwd });
    const token = r.sessionToken || r.session || r.token;
    if(!token) throw { error: 'No session token returned' };
    saveToken(token);
    setMsg(loginMsg, 'Logged in!', true);
    redirect();
  }catch(err){
    setMsg(loginMsg, err.error || err.message || 'Invalid credentials');
    loginBtn.disabled = false;
    loginBtn.textContent = 'Log in';
  }
});

// Handle guest login (requires tiny server fn: guest-login; see note below)
guestBtn?.addEventListener('click', async () => {
  clear(guestMsg);
  guestBtn.disabled = true;
  guestBtn.textContent = 'Continuing…';
  try{
    const r = await call('guest-login', {}); // returns { ok: true, sessionToken }
    const token = r.sessionToken || r.token;
    if(!token) throw { error: 'No session token returned' };
    saveToken(token);
    redirect();
  }catch(err){
    setMsg(guestMsg, err.error || err.message || 'Guest login failed.');
    guestBtn.disabled = false;
    guestBtn.textContent = 'Guest Login';
  }
});
