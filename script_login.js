// Handle email/password login
loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  clear(loginMsg);

  const email = (loginEmail.value || '').trim();
  const pwd = (loginPwd.value || '');

  if (!email || !pwd) {
    return setMsg(loginMsg, 'Missing loginId or password');
  }

  loginBtn.disabled = true;
  loginBtn.textContent = 'Logging in…';

  try {
    const r = await call('login', { loginId: email, password: pwd });
    const token = r.sessionToken || r.session || r.token;
    if (!token) throw { error: 'No session token returned' };
    saveToken(token);
    setMsg(loginMsg, 'Logged in!', true);
    document.body.classList.remove('guest'); // ensure guest class is removed
    redirect();
  } catch (err) {
    setMsg(loginMsg, err.error || err.message || 'Invalid credentials');
    loginBtn.disabled = false;
    loginBtn.textContent = 'Log in';
  }
});

// Handle guest login (requires tiny server fn: guest-login)
guestBtn?.addEventListener('click', async () => {
  clear(guestMsg);
  guestBtn.disabled = true;
  guestBtn.textContent = 'Continuing…';
  try {
    const r = await call('guest-login', {}); // returns { ok: true, sessionToken }
    const token = r.sessionToken || r.token;
    if (!token) throw { error: 'No session token returned' };
    saveToken(token);
    document.body.classList.add('guest'); // add guest class
    redirect();
  } catch (err) {
    setMsg(guestMsg, err.error || err.message || 'Guest login failed.');
    guestBtn.disabled = false;
    guestBtn.textContent = 'Guest Login';
  }
});
