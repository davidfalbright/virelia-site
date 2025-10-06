// ---- helpers ----
const $ = (id) => document.getElementById(id);
const API = (p) => `/.netlify/functions/${p}`;
const looksLikeEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || '').trim());

// Form elements
const emailEl = $('email');
const passwordEl = $('password');
const createAccountBtn = $('createAccountBtn');
const msgEl = $('msg');  // Message element

// Handle form submission to create account
document.getElementById('createAccountForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  msgEl.textContent = '';  // Reset message
  const email = emailEl.value.trim();
  const password = passwordEl.value.trim();

  // Validate email and password
  if (!looksLikeEmail(email)) {
    setMsg(msgEl, 'Please enter a valid email.', false);
    return;
  }
  if (password.length < 8) {
    setMsg(msgEl, 'Password must be at least 8 characters long.', false);
    return;
  }

  createAccountBtn.disabled = true;
  createAccountBtn.textContent = 'Creating...';

  try {
    // Call the API to request sending the code
    const res = await fetch(API('request-code'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (res.ok) {
      const data = await res.json();
      // Show the user that the verification email was sent
      setMsg(msgEl, data.message || 'Check your email inbox for the verification code!', true);
    } else {
      const error = await res.json();
      setMsg(msgEl, error.error || 'Failed to create account, please try again.', false);
    }
  } catch (err) {
    setMsg(msgEl, 'Unexpected error occurred. Please try again later.', false);
  }

  createAccountBtn.disabled = false;
  createAccountBtn.textContent = 'Create Account';
});

// Display message
function setMsg(el, text, success) {
  el.textContent = text;
  el.style.color = success ? 'green' : 'red';
}
