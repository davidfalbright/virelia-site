// lab.js
// Virelia Lab: access control plus read-only localhost trace investigation.
// This file does not execute runners, simulations, or PowerShell commands.

(function () {
  "use strict";

  const LOCAL_SERVICE_BASE_URL = "http://127.0.0.1:8787";
  const LOCAL_STATUS_URL = `${LOCAL_SERVICE_BASE_URL}/status`;
  const LOCAL_RUNS_URL = `${LOCAL_SERVICE_BASE_URL}/runs`;

  function readCookie(name) {
    const escapedName = name.replace(/[-[\]/{}()*+?.\\^$|]/g, "\\$&");
    const match = document.cookie.match(
      new RegExp("(?:^|;\\s*)" + escapedName + "=([^;]*)")
    );

    return match ? decodeURIComponent(match[1]) : null;
  }

  function readToken() {
    try {
      const storedToken = localStorage.getItem("session_token");
      if (storedToken) return storedToken;
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

    if (yearElement) {
      yearElement.textContent = new Date().getFullYear();
    }
  }

  function showAuthorizedLab(session) {
    const authorizedSection = document.getElementById("labAuthorized");
    const unauthorizedSection = document.getElementById("labUnauthorized");
    const accessBadge = document.getElementById("labAccessBadge");

    if (unauthorizedSection) {
      unauthorizedSection.classList.add("lab-hidden");
    }

    if (authorizedSection) {
      authorizedSection.classList.remove("lab-hidden");
    }

    if (accessBadge) {
      const identity = session.email || "Authorized Virelia user";
      accessBadge.textContent = "Authorized: " + identity;
    }
  }

  function showUnauthorizedLab() {
    const authorizedSection = document.getElementById("labAuthorized");
    const unauthorizedSection = document.getElementById("labUnauthorized");

    if (authorizedSection) {
      authorizedSection.classList.add("lab-hidden");
    }

    if (unauthorizedSection) {
      unauthorizedSection.classList.remove("lab-hidden");
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatDate(value) {
    if (!value) return "Not recorded";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleString();
  }

  function setStatusIndicator(dotId, textId, text, isReady) {
    const dot = document.getElementById(dotId);
    const label = document.getElementById(textId);

    if (label) {
      label.textContent = text;
    }

    if (dot) {
      dot.classList.remove("offline", "prototype", "ready");
      dot.classList.add(isReady ? "ready" : "offline");
    }
  }

  function setRunnerCardStatus(text, isReady) {
    setStatusIndicator(
      "runnerStatusDot",
      "runnerStatus",
      text,
      isReady
    );
  }

  async function fetchJson(url) {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Local service returned HTTP ${response.status}.`);
    }

    return response.json();
  }

  function renderRunOptions(runs) {
    const select = document.getElementById("runSelect");

    if (!select) return;

    select.innerHTML = "";

    runs.forEach((run) => {
      const option = document.createElement("option");

      option.value = run.runId;

      const scenario = run.scenarioId || "Scenario not recorded";
      const validation = run.traceValidationStatus || "UNKNOWN";

      option.textContent =
        `${run.runId} — ${scenario} — validation: ${validation}`;

      select.appendChild(option);
    });

    select.disabled = runs.length === 0;
  }

  function renderValidation(validation, integrity) {
    const container = document.getElementById("selectedRunValidation");

    if (!container) return;

    const validationStatus = validation?.status || "UNAVAILABLE";

    let integrityStatus = "UNAVAILABLE";

    if (integrity?.traceIntegrity?.integrity_status) {
      integrityStatus = integrity.traceIntegrity.integrity_status;
    } else if (integrity?.integrityAvailable === false) {
      integrityStatus = "UNAVAILABLE";
    }

    const validationClass =
      validationStatus === "PASS" ? "ready" : "offline";

    const integrityClass =
      integrityStatus === "valid" ? "ready" : "offline";

    const checks = validation?.checks || {};

    const checkRows = Object.entries(checks)
      .map(([name, passed]) => {
        return `
          <li>
            ${escapeHtml(name)}:
            <strong>${passed === true ? "passed" : "failed"}</strong>
          </li>
        `;
      })
      .join("");

    const integrityDetails = integrity?.traceIntegrity
      ? `
        Sequence gaps: ${escapeHtml(integrity.traceIntegrity.sequence_gap_count ?? "unknown")}<br>
        Duplicate event IDs: ${escapeHtml(integrity.traceIntegrity.duplicate_event_id_count ?? "unknown")}<br>
        Missing evidence references: ${escapeHtml(integrity.traceIntegrity.missing_evidence_reference_count ?? "unknown")}
      `
      : "No integrity record was returned for this run.";

    container.innerHTML = `
      <div class="lab-grid" style="margin-top: 12px;">
        <div class="lab-card" style="min-height: 0;">
          <div class="lab-status">
            <span class="status-dot ${validationClass}"></span>
            <strong>Trace validation: ${escapeHtml(validationStatus)}</strong>
          </div>

          <ul class="lab-list" style="margin-top: 12px;">
            ${checkRows || "<li>No validation details returned.</li>"}
          </ul>
        </div>

        <div class="lab-card" style="min-height: 0;">
          <div class="lab-status">
            <span class="status-dot ${integrityClass}"></span>
            <strong>Trace integrity: ${escapeHtml(integrityStatus)}</strong>
          </div>

          <p style="margin-top: 12px;">
            ${integrityDetails}
          </p>
        </div>
      </div>
    `;
  }

  function renderTimeline(events) {
    const container = document.getElementById("selectedRunTimeline");

    if (!container) return;

    if (!Array.isArray(events) || events.length === 0) {
      container.innerHTML = "<p>No trace events were returned for this run.</p>";
      return;
    }

    container.innerHTML = events
      .map((event) => {
        const subject =
          event.subject_ref?.id ||
          event.subject_ref?.type ||
          "Run";

        const summary =
          event.outcome?.summary ||
          event.outcome?.result ||
          "No event summary recorded.";

        return `
          <article class="lab-card" style="min-height: 0; margin-bottom: 12px;">
            <div style="display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap;">
              <strong>
                ${escapeHtml(event.sequence_number)}.
                ${escapeHtml(event.event_type)}
              </strong>

              <span style="color: #9fb5c7;">
                ${escapeHtml(event.logical_phase || "unclassified")}
              </span>
            </div>

            <p style="margin-top: 10px; margin-bottom: 8px;">
              ${escapeHtml(summary)}
            </p>

            <div style="color: #b9cad8; font-size: 0.92rem;">
              Subject: ${escapeHtml(subject)}
              · Status: ${escapeHtml(event.status || "unknown")}
            </div>
          </article>
        `;
      })
      .join("");
  }

  function renderArtifacts(artifactPayload) {
    const container = document.getElementById("selectedRunArtifacts");

    if (!container) return;

    const artifacts = artifactPayload?.artifacts?.artifacts || [];

    if (!Array.isArray(artifacts) || artifacts.length === 0) {
      container.innerHTML = "<p>No artifacts were returned for this run.</p>";
      return;
    }

    container.innerHTML = `
      <ul class="lab-list">
        ${artifacts
          .map((artifact) => {
            return `
              <li>
                <strong>
                  ${escapeHtml(artifact.artifact_type || artifact.artifact_id)}
                </strong>
                — ${escapeHtml(artifact.description || "No description")}
                <br>
                <span style="color: #9fb5c7;">
                  Created by: ${escapeHtml(artifact.created_by_event_id || "not recorded")}
                </span>
              </li>
            `;
          })
          .join("")}
      </ul>
    `;
  }

  async function loadSelectedRun(runId) {
    const detailPanel = document.getElementById("runDetailPanel");
    const title = document.getElementById("selectedRunTitle");
    const summary = document.getElementById("selectedRunSummary");

    if (!runId || !detailPanel || !title || !summary) {
      return;
    }

    detailPanel.classList.remove("lab-hidden");

    title.textContent = `Loading ${runId}…`;
    summary.textContent = "Reading local trace package…";

    try {
      const encodedRunId = encodeURIComponent(runId);

      const [
        manifestPayload,
        validationPayload,
        integrityPayload,
        artifactsPayload,
        tracePayload
      ] = await Promise.all([
        fetchJson(`${LOCAL_SERVICE_BASE_URL}/runs/${encodedRunId}/manifest`),
        fetchJson(`${LOCAL_SERVICE_BASE_URL}/runs/${encodedRunId}/validation`),
        fetchJson(`${LOCAL_SERVICE_BASE_URL}/runs/${encodedRunId}/integrity`),
        fetchJson(`${LOCAL_SERVICE_BASE_URL}/runs/${encodedRunId}/artifacts`),
        fetchJson(`${LOCAL_SERVICE_BASE_URL}/runs/${encodedRunId}/trace?limit=250`)
      ]);

      const manifest = manifestPayload.manifest || {};
      const validation = validationPayload.validation || {};
      const integrity = integrityPayload || {};
      const trace = tracePayload || {};

      title.textContent = `${runId} — ${manifest.run_status || "run"}`;

      summary.innerHTML = `
        Profile: <strong>${escapeHtml(manifest.profile || "unknown")}</strong><br>
        Runner: <strong>${escapeHtml(manifest.runner_id || "unknown")}</strong><br>
        Started: <strong>${escapeHtml(formatDate(manifest.started_at))}</strong><br>
        Completed: <strong>${escapeHtml(formatDate(manifest.completed_at))}</strong><br>
        Trace events returned: <strong>${escapeHtml(trace.returnedEventCount || 0)}</strong>
      `;

      renderValidation(validation, integrity);
      renderTimeline(trace.events || []);
      renderArtifacts(artifactsPayload);
    } catch (error) {
      title.textContent = `${runId} — unavailable`;
      summary.textContent =
        `The selected local trace package could not be loaded: ${error.message}`;

      const validationContainer = document.getElementById("selectedRunValidation");
      const timelineContainer = document.getElementById("selectedRunTimeline");
      const artifactsContainer = document.getElementById("selectedRunArtifacts");

      if (validationContainer) validationContainer.innerHTML = "";
      if (timelineContainer) timelineContainer.innerHTML = "";
      if (artifactsContainer) artifactsContainer.innerHTML = "";
    }
  }

  async function refreshRunWorkspace() {
    const summary = document.getElementById("runWorkspaceSummary");
    const select = document.getElementById("runSelect");
    const detailPanel = document.getElementById("runDetailPanel");
    const refreshButton = document.getElementById("refreshRunsButton");

    if (!summary || !select) return;

    summary.textContent = "Checking the local Virelia trace service…";
    select.disabled = true;

    if (refreshButton) {
      refreshButton.disabled = true;
    }

    try {
      const [status, runIndex] = await Promise.all([
        fetchJson(LOCAL_STATUS_URL),
        fetchJson(LOCAL_RUNS_URL)
      ]);

      const isReady =
        status.overallReady === true &&
        status.traceApiAvailable === true;

      const runs = Array.isArray(runIndex.runs)
        ? runIndex.runs
        : [];

      setRunnerCardStatus(
        isReady
          ? "Local runner ready — execution disabled"
          : "Local runner connected — configuration needs attention",
        isReady
      );

      setStatusIndicator(
        "runWorkspaceStatusDot",
        "runWorkspaceStatus",
        isReady
          ? `Local trace service connected — ${runs.length} run package${runs.length === 1 ? "" : "s"} available`
          : "Local trace service connected — configuration needs attention",
        isReady
      );

      summary.textContent = isReady
        ? `Connected to this computer's local read-only Virelia trace service. ${runs.length} run package${runs.length === 1 ? "" : "s"} available.`
        : "Connected to the local service, but its configuration is not fully ready.";

      renderRunOptions(runs);

      if (runs.length > 0) {
        await loadSelectedRun(runs[0].runId);
      } else if (detailPanel) {
        detailPanel.classList.add("lab-hidden");
      }
    } catch (_) {
      setRunnerCardStatus("Local runner not connected", false);

      setStatusIndicator(
        "runWorkspaceStatusDot",
        "runWorkspaceStatus",
        "Local Virelia service unavailable",
        false
      );

      summary.textContent =
        "The local Virelia service is not available on this computer. Start the local service, then select Refresh Local Runs.";

      select.innerHTML = "<option>Local service unavailable</option>";
      select.disabled = true;

      if (detailPanel) {
        detailPanel.classList.add("lab-hidden");
      }
    } finally {
      if (refreshButton) {
        refreshButton.disabled = false;
      }
    }
  }

  function bindRunWorkspaceEvents() {
    const select = document.getElementById("runSelect");
    const refreshButton = document.getElementById("refreshRunsButton");

    if (select) {
      select.addEventListener("change", () => {
        loadSelectedRun(select.value);
      });
    }

    if (refreshButton) {
      refreshButton.addEventListener("click", refreshRunWorkspace);
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

    if (!storedRole) {
      storedRole = readCookie("session_role");
    }

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
    bindRunWorkspaceEvents();
    refreshRunWorkspace();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeLab);
  } else {
    initializeLab();
  }
})();
