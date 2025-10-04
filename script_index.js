 <script>
    const $ = (id) => document.getElementById(id);
    const requestForm = $('requestForm'), verifyForm = $('verifyForm'), createCredsForm = $('createCredsForm'), loginForm = $('loginForm');
    const emailEl = $('email'), codeEl = $('code'), requestBtn = $('requestBtn'), verifyBtn = $('verifyBtn'), createBtn = $('createBtn'), loginBtn = $('loginBtn');
    const msg1 = $('msg1'), msg2 = $('msg2'), msg3 = $('msg3'), msg4 = $('msg4'), sessionOut = $('sessionOut');
    const resendLink = $('resendLink'), refreshLink = $('refreshLink'), showLoginLink = $('showLoginLink');
    const usernameEl = $('username'), passwordEl = $('password'), loginIdEl = $('loginId'), loginPwdEl = $('loginPwd');

    let pendingEmail = null;
    let canCreateCreds = false; // server tells us when both verified+confirmed are true

    const looksLikeEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
    const normCVC = s => (s||'').toUpperCase().replace(/[^A-Z-]/g,'');
    const isCVC = s => /^[A-Z]{3}-[A-Z]{3}$/.test(s);

    // Request code+link
    requestForm.addEventListener('submit', async (e) => {
      e.preventDefault(); msg1.textContent='';
      const email = (emailEl.value||'').trim();
      if (!looksLikeEmail(email)) { msg1.textContent='Please enter a valid email.'; msg1.className='msg err'; return; }

      requestBtn.disabled = true; requestBtn.textContent = 'Sending…';
      try {
        const res = await fetch('/.netlify/functions/request-code', {
          method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email })
        });
        const data = await res.json().catch(()=> ({}));
        if (!res.ok) throw new Error(data.error || 'Send failed');
        pendingEmail = email;
        msg1.textContent = `Email sent to ${email}. Click the Confirm link and enter the code.`; msg1.className='msg ok';
        requestBtn.textContent = 'Sent!';
        verifyForm.classList.remove('hidden');
        codeEl.focus();
      } catch (err) {
        msg1.textContent = err.message || 'Could not send email.'; msg1.className='msg err';
        requestBtn.textContent = 'Email me the code + link'; requestBtn.disabled = false;
      }
    });

    // Verify code
    verifyForm.addEventListener('submit', async (e) => {
      e.preventDefault(); msg2.textContent='';
      const raw = normCVC(codeEl.value);
      if (!isCVC(raw)) { msg2.textContent='Enter the 6-character code like ABC-DEF.'; msg2.className='msg err'; return; }
      verifyBtn.disabled = true; verifyBtn.textContent = 'Verifying…';
      try {
        const res = await fetch('/.netlify/functions/verify-code', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ email: pendingEmail, code: raw })
        });
        const data = await res.json().catch(()=> ({}));
        if (!res.ok) throw new Error(data.error || 'Verification failed');

        const { hasCredentials, confirmed, canCreate } = data;
        canCreateCreds = !!canCreate;

        msg2.textContent = confirmed
          ? 'Code verified and email confirmed. You may proceed.'
          : 'Code verified. Please click the Confirm link in your email to continue.';
        msg2.className = confirmed ? 'msg ok' : 'msg err';
        verifyBtn.textContent = confirmed ? 'Verified' : 'Verified (awaiting confirm)';
        verifyBtn.disabled = confirmed;

        if (confirmed) {
          if (hasCredentials) {
            loginForm.classList.remove('hidden'); loginIdEl.value = pendingEmail; loginPwdEl.focus();
          } else {
            createCredsForm.classList.remove('hidden'); usernameEl.focus();
          }
        }
      } catch (err) {
        msg2.textContent = err.message || 'Invalid or expired code. Please resend.'; msg2.className='msg err';
        verifyBtn.textContent = 'Verify code'; verifyBtn.disabled = false;
      }
    });

    // Refresh status after they click the email link
    refreshLink.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!pendingEmail) return;
      const res = await fetch('/.netlify/functions/check-status', {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email: pendingEmail })
      });
      const data = await res.json().catch(()=> ({}));
      if (data.confirmed && data.verified) {
        msg2.textContent = 'Email confirmed and code verified — proceed.';
        msg2.className = 'msg ok';
        if (data.hasCredentials) {
          loginForm.classList.remove('hidden'); loginIdEl.value = pendingEmail; loginPwdEl.focus();
        } else {
          createCredsForm.classList.remove('hidden'); usernameEl.focus();
        }
      } else {
        msg2.textContent = 'Still waiting for both steps. Be sure to click the Confirm link and enter the code.';
        msg2.className = 'msg err';
      }
    });

    // Switch to login
    $('showLoginLink').addEventListener('click', (e) => {
      e.preventDefault();
      createCredsForm.classList.add('hidden');
      loginForm.classList.remove('hidden');
      loginIdEl.value = pendingEmail || '';
      loginPwdEl.focus();
    });

    // Create credentials
    $('createCredsForm').addEventListener('submit', async (e) => {
      e.preventDefault(); msg3.textContent='';
      if (!canCreateCreds) { msg3.textContent='Please complete email Confirm + code first.'; msg3.className='msg err'; return; }
      const username = ($('username').value||'').trim();
      const password = ($('password').value||'').trim();
      if (!/^[a-zA-Z0-9._-]{3,20}$/.test(username)) { msg3.textContent='Username must be 3–20 chars.'; msg3.className='msg err'; return; }
      if (password.length < 8) { msg3.textContent='Password must be at least 8 characters.'; msg3.className='msg err'; return; }

      $('createBtn').disabled = true; $('createBtn').textContent = 'Creating…';
      try {
        const res = await fetch('/.netlify/functions/create-credentials', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ email: pendingEmail, username, password })
        });
        const data = await res.json().catch(()=> ({}));
        if (!res.ok) throw new Error(data.error || 'Could not create account');
        msg3.textContent = 'Account created! You can now log in.'; msg3.className='msg ok';
        $('createBtn').textContent = 'Created';
        loginForm.classList.remove('hidden');
        $('loginId').value = username; $('loginPwd').focus();
      } catch (err) {
        msg3.textContent = err.message || 'Error creating account.'; msg3.className='msg err';
        $('createBtn').textContent = 'Create account'; $('createBtn').disabled = false;
      }
    });

    // Login
    $('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault(); msg4.textContent = '';
      const loginId = ($('loginId').value||'').trim();
      const password = ($('loginPwd').value||'');
      if (!loginId || !password) { msg4.textContent='Enter your username/email and password.'; msg4.className='msg err'; return; }

      $('loginBtn').disabled = true; $('loginBtn').textContent = 'Logging in…';
      try {
        const res = await fetch('/.netlify/functions/login', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ loginId, password })
        });
        const data = await res.json().catch(()=> ({}));
        if (!res.ok) throw new Error(data.error || 'Login failed');

        msg4.textContent = 'Logged in!'; msg4.className='msg ok';
        $('loginBtn').textContent = 'Logged in';
        if (data.sessionToken) {
          localStorage.setItem('session_token', data.sessionToken);
          $('sessionOut').classList.remove('hidden');
          $('sessionOut').textContent = `session_token: ${data.sessionToken}`;
        }
      } catch (err) {
        msg4.textContent = err.message || 'Invalid credentials.'; msg4.className='msg err';
        $('loginBtn').textContent = 'Log in'; $('loginBtn').disabled = false;
      }
    });

    // Resend
    resendLink.addEventListener('click', (e) => {
      e.preventDefault();
      if (!pendingEmail) { emailEl.focus(); return; }
      requestBtn.disabled = false; requestBtn.textContent = 'Email me the code + link';
      requestForm.dispatchEvent(new Event('submit'));
    });

    
  </script>

      
