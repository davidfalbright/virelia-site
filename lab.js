```javascript
// lab.js
// Virelia Lab: session check + page visibility only.
// No runner execution, repository access, or operational data yet.

(function () {
  "use strict";

  function readCookie(name) {
    const escapedName = name.replace(/[-[\]/{}()*+?.\\^$|]/g, "\\$&");
    const match = document.cookie.match(
      new RegExp("(?:^|;\\s*)" + escapedName + "=([^;]*)")
    );

    return match ? decodeURIComponent(match[1]) : null;
  }

  function readToken() {
    try {
      const tokenFromStorage = localStorage.getItem("session_token");
      if (tokenFromStorage) return tokenFromStorage;
    } catch (_) {
      // Ignore localStorage access issues and fall back to cookie.
    }

    return readCookie("session_token");
  }

  function parsePayload(jwt) {
    const parts = (jwt || "").split(".");

    if (parts.length < 2) {
      return null;
    }

    const base64 = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    try {
      const json = atob(base64);

      return JSON.parse(
        decodeURIComponent(
          json
            .split("")
            .map((character) => {
              return "%" + ("00" + character.charCodeAt(0).toString(16)).slice(-2);
            })
            .join("")
        )
      );
    } catch (_) {
      try {
        return JSON.parse(atob(base64));
      } catch (_) {
        return null;
      }
    }
  }

  function clearSessionEverywhere() {
    try {
      localStorage.removeItem("session_token");
      localStorage.removeItem("session_role");
    } catch (_) {
      // Continue even if localStorage is unavailable.
    }

    document.cookie = "session_token=; Max-Age=0; Path=/; SameSite=Lax";
    document.cookie =
      "session_token=; Max-Age=0; Path=/; SameSite=Lax; Domain=.iamvirelia.org";
    document.cookie =
      "session_token=; Max-Age=0; Path=/; SameSite=Lax; Domain=www.iamvirelia.org";

    document.cookie = "session_role=; Max-Age=0; Path=/; SameSite=Lax";
    document.cookie =
      "session_role=; Max-Age=0; Path=/; SameSite=Lax; Domain=.iamvirelia.org";
    document.cookie =
      "session_role=; Max-Age=0; Path=/; SameSite=Lax; Domain=www.iamvirelia.org";
  }

  function redirectToLogin(reason) {
    clearSessionEverywhere();
    window.location.replace("/?session=" + encodeURIComponent(reason));
  }

  function showAuthorizedLab(session) {
    const authorizedSection = document.getElementById("labAuthorized");
    const unauthorizedSection = document.getElementById("labUnauthorized");
    const accessBadge = document.getElementById("labAccessBadge");
    const yearElement = document.getElementById("year");

    if (unauthorizedSection) {
      unauthorizedSection.classList.add("lab-hidden");
    }

    if (authorizedSection) {
      authorizedSection.classList.remove("lab-hidden");
    }

    if (accessBadge) {
      const displayIdentity = session.email || "Authorized Virelia user";
      accessBadge.textContent = "Authorized: " + displayIdentity;
    }

    if (yearElement) {
      yearElement.textContent = new Date().getFullYear();
    }
  }

  function showUnauthorizedLab() {
    const authorizedSection = document.getElementById("labAuthorized");
    const unauthorizedSection = document.getElementById("labUnauthorized");
    const yearElement = document.getElementById("year");

    if (authorizedSection) {
      authorizedSection.classList.add("lab-hidden");
    }

    if (unauthorizedSection) {
      unauthorizedSection.classList.remove("lab-hidden");
    }

    if (yearElement) {
      yearElement.textContent = new Date().getFullYear();
    }
  }

  function initializeLab() {
    const token = readToken();

    if (!token) {
      redirectToLogin("missing");
      return;
    }

    const payload = parsePayload(token) || {};
    const expiration = typeof payload.exp === "number" ? payload.exp : 0;

    if (!expiration || Date.now() > expiration) {
      redirectToLogin("expired");
      return;
    }

    let storedRole = null;

    try {
      storedRole = localStorage.getItem("session_role");
    } catch (_) {
      storedRole = null;
    }

    if (!storedRole) {
      storedRole = readCookie("session_role");
    }

    const role = payload.role || storedRole || null;
    const email = payload.email || payload.sub || "";

    const isGuest =
      role === "guest" ||
      email === "guest";

    // Current rule:
    // Guests are denied Lab access.
    // Any valid non-guest account is allowed.
    //
    // Later, when you add multiple regular users, we can tighten this
    // to allow only your specific Virelia administrator identity.
    if (isGuest) {
      showUnauthorizedLab();

      window.setTimeout(function () {
        window.location.replace("landing_page.html");
      }, 1800);

      return;
    }

    window.__SESSION__ = {
      token: token,
      email: email,
      role: role
    };

    window.__clearSessionEverywhere__ = clearSessionEverywhere;

    showAuthorizedLab(window.__SESSION__);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeLab);
  } else {
    initializeLab();
  }
})();
```
