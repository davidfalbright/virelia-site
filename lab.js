// lab.js
// Virelia Lab: access visibility plus local runner-status display.
// This file does not execute runners, simulations, or PowerShell commands.

(function () {
  "use strict";

  const LOCAL_STATUS_URL = "http://127.0.0.1:8787/status";

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
      // Fall back to cookie.
    }

    return readCookie("session_token");
  }

  function parsePayload(jwt) {
    const parts = (jwt || "").split(".");
    if (parts.length < 2) return null;

    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");

    try {
      const json = atob(base64);
      return JSON.parse(
        decodeURIComponent(
          json
            .split("")
            .map((character) => "%" + ("00" + character.charCodeAt(0).toString(16)).slice(-2))
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
      // Continue.
    }

    const cookieNames = ["session_token", "session_role"];
    const domains = ["", "; Domain=.iamvirelia.org", "; Domain=www.iamvirelia.org"];

    cookieNames.forEach((name) => {
      domains.forEach((domain) => {
        document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${domain}`;
      });
    });
  }

  function redirectToLogin(reason) {
    clearSessionEverywhere();
    window.location.replace("/?session=" + encodeURIComponent(reason));
  }

  function setFooterYear() {
    const yearElement = document.getElementById("year");
    if (yearElement) yearElement.textContent = new Date().getFullYear();
  }

  function showAuthorizedLab(session) {
    const authorizedSection = document.getElementById("labAuthorized");
    const unauthorizedSection = document.getElementById("labUnauthorized");
    const accessBadge = document.getElementById("labAccessBadge");

    if (unauthorizedSection) unauthorizedSection.classList.add("lab-hidden");
    if (authorizedSection) authorizedSection.classList.remove("lab-hidden");

    if (accessBadge) {
      const identity = session.email || "Authorized Virelia user";
      accessBadge.textContent = "Authorized: " + identity;
    }
  }

  function showUnauthorizedLab() {
    const authorizedSection = document.getElementById("labAuthorized");
    const unauthorizedSection = document.getElementById("labUnauthorized");

    if (authorizedSection) authorizedSection.classList.add("lab-hidden");
    if (unauthorizedSection) unauthorizedSection.classList.remove("lab-hidden");
  }

  function getOrCreateLiveStatusPanel() {
    let panel = document.getElementById("localRunnerStatusPanel");
    if (panel) return panel;

    const authorizedSection = document.getElementById("labAuthorized");
    if (!authorizedSection) return null;

    panel = document.createElement("section");
    panel.id = "localRunnerStatusPanel";
    panel.className = "lab-panel";
    panel.innerHTML = `
      <h2>Local Runner Connection</h2>
      <p id="localRunnerStatusSummary">Checking local runner status…</p>
      <div id="localRunnerProfileList" class="lab-list"></div>
    `;

    const footerActions = authorizedSection.querySelector(".lab-footer-actions");
    if (footerActions) {
      authorizedSection.insertBefore(panel, footerActions);
    } else {
      authorizedSection.appendChild(panel);
    }

    return panel;
  }

  function setRunnerCardStatus(text, ready) {
    const runnerStatus = document.getElementById("runnerStatus");
    if (!runnerStatus) return;

    runnerStatus.textContent = text;

    const dot = runnerStatus.parentElement
      ? runnerStatus.parentElement.querySelector(".status-dot")
      : null;

    if (dot) {
      dot.classList.remove("offline", "prototype", "ready");
      dot.classList.add(ready ? "ready" : "offline");
    }
  }

  function profileMarkup(profile) {
    const stateText = profile.ready ? "Ready" : "Not ready";
    const stateClass = profile.ready ? "ready" : "offline";
    const allowedRuns = Array.isArray(profile.allowedRuns) && profile.allowedRuns.length
      ? profile.allowedRuns.join(", ")
      : "None configured";

    const checks = Array.isArray(profile.checks) ? profile.checks : [];
    const failures = checks.filter((check) => !check.passed);

    const detail = failures.length
      ? failures.map((check) => `${check.name}: ${check.detail}`).join(" | ")
      : "All configured local checks passed.";

    return `
      <div style="margin: 0 0 15px;">
        <div class="lab-status">
          <span class="status-dot ${stateClass}"></span>
          <strong>${escapeHtml(profile.label || profile.id || "Runner profile")}: ${stateText}</strong>
        </div>
        <div style="margin: 7px 0 0 19px; color: #b9cad8; line-height: 1.5;">
          Allowed runs: ${escapeHtml(allowedRuns)}<br>
          ${escapeHtml(detail)}
        </div>
      </div>
    `;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  async function refreshLocalRunnerStatus() {
    const panel = getOrCreateLiveStatusPanel();
    const summary = document.getElementById("localRunnerStatusSummary");
    const profileList = document.getElementById("localRunnerProfileList");

    if (!panel || !summary || !profileList) return;

    summary.textContent = "Checking local status service…";
    profileList.innerHTML = "";

    try {
      const response = await fetch(LOCAL_STATUS_URL, {
        method: "GET",
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(`Status service returned HTTP ${response.status}`);
      }

      const data = await response.json();
      const profiles = Array.isArray(data.profiles) ? data.profiles : [];
      const overallReady = data.overallReady === true;
      const executionEnabled = data.executionEnabled === true;

      summary.textContent = overallReady
        ? `Connected to this computer's local runner service. Execution is ${executionEnabled ? "enabled" : "disabled"}.`
        : "Connected to the local runner service, but one or more configured checks are not ready.";

      setRunnerCardStatus(
        overallReady
          ? `Local runner ready — execution ${executionEnabled ? "enabled" : "disabled"}`
          : "Local runner connected — configuration needs attention",
        overallReady
      );

      profileList.innerHTML = profiles.length
        ? profiles.map(profileMarkup).join("")
        : "<div>No runner profiles were returned by the local service.</div>";
    } catch (error) {
      summary.textContent =
        "Local runner status is unavailable. Ensure the local status service is running on this computer.";

      profileList.innerHTML =
        `<div style="color: #b9cad8; line-height: 1.5;">${escapeHtml(error.message)}</div>`;

      setRunnerCardStatus("Local runner not connected", false);
    }
  }

  function initializeLab() {
    setFooterYear();

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

    if (!storedRole) storedRole = readCookie("session_role");

    const role = payload.role || storedRole || null;
    const email = payload.email || payload.sub || "";
    const isGuest = role === "guest" || email === "guest";

    if (isGuest) {
      showUnauthorizedLab();
      window.setTimeout(() => {
        window.location.replace("landing_page.html");
      }, 1800);
      return;
    }

    window.__SESSION__ = { token, email, role };
    window.__clearSessionEverywhere__ = clearSessionEverywhere;

    showAuthorizedLab(window.__SESSION__);
    refreshLocalRunnerStatus();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeLab);
  } else {
    initializeLab();
  }
})();
