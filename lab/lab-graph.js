// lab/lab-graph.js
// Read-only Virelia Governance MRI structural graph.
// Loads a Projection Engine artifact prepared for 3d-force-graph.

(function () {
  "use strict";

  const GRAPH_DATA_URL =
    "lab/data/Virelia_Consulting_view_cache_3d_force_graph_TEST_DATA.json";

  const NODE_COLORS = Object.freeze({
    region: "#f2c65b",
    cluster: "#62b3ff",
    distortion_cluster: "#d58cff",
    conviction: "#55e6b4",
    safeguard: "#ff8f70",
    principle: "#85d4ff",
    diagnostic_distortion: "#b48cff",
    default: "#a8b7c5"
  });

  let graphInstance = null;
  let graphPayload = null;
  let resizeObserver = null;
  let initialized = false;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function displayValue(value) {
    if (value === null || value === undefined || value === "") {
      return "Not recorded";
    }

    if (Array.isArray(value)) {
      return value.length ? value.join(", ") : "None";
    }

    if (typeof value === "object") {
      return JSON.stringify(value, null, 2);
    }

    return String(value);
  }

  function nodeColor(node) {
    return NODE_COLORS[node.node_family] || NODE_COLORS.default;
  }

  function nodeSize(node) {
    const suggested = Number(node.size_hint);

    if (Number.isFinite(suggested) && suggested > 0) {
      return suggested;
    }

    return 3;
  }

  function linkWidth(link) {
    const influence = Number(link.max_influence_strength);

    if (Number.isFinite(influence) && influence > 0) {
      return Math.min(4, 0.7 + influence * 1.8);
    }

    return 0.7;
  }

  function linkColor(link) {
    if (link.attachment_type === "distortion_cluster_membership") {
      return "rgba(180, 140, 255, 0.34)";
    }

    if (link.attachment_type === "distortion_cluster_region_projection") {
      return "rgba(213, 140, 255, 0.52)";
    }

    if (link.attachment_type === "region_membership") {
      return "rgba(242, 198, 91, 0.48)";
    }

    return "rgba(128, 183, 224, 0.38)";
  }

  function setGraphStatus(message, state) {
    const container = document.getElementById("governanceGraph");

    if (!container) return;

    container.dataset.graphState = state || "";
    container.setAttribute("aria-label", message);
  }

  function renderGraphMessage(title, message) {
    const container = document.getElementById("governanceGraph");

    if (!container) return;

    container.innerHTML = `
      <div class="lab-graph-message">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(message)}</span>
      </div>
    `;
  }

  function renderNodeDetails(node) {
    const title = document.getElementById("graphDetailTitle");
    const content = document.getElementById("graphDetailContent");

    if (!title || !content) return;

    title.textContent = node.name || node.label || node.id || "Selected object";

    const traceLabels = Array.isArray(node.trace_labels)
      ? node.trace_labels
      : [];

    const origin =
      node.origin && typeof node.origin === "object"
        ? node.origin
        : {};

    content.innerHTML = `
      <dl class="lab-graph-detail-list">
        <div>
          <dt>Object ID</dt>
          <dd>${escapeHtml(displayValue(node.id))}</dd>
        </div>
        <div>
          <dt>Family</dt>
          <dd>${escapeHtml(displayValue(node.node_family))}</dd>
        </div>
        <div>
          <dt>Object type</dt>
          <dd>${escapeHtml(displayValue(node.object_type))}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>${escapeHtml(displayValue(node.status))}</dd>
        </div>
        <div>
          <dt>Domain</dt>
          <dd>${escapeHtml(displayValue(node.domain_name))}</dd>
        </div>
        <div>
          <dt>Subdomain</dt>
          <dd>${escapeHtml(displayValue(node.subdomain_name))}</dd>
        </div>
        <div>
          <dt>Energizing threshold</dt>
          <dd>${escapeHtml(displayValue(node.energizing_threshold))}</dd>
        </div>
        <div>
          <dt>Compiled attachments</dt>
          <dd>${escapeHtml(displayValue(node.attachment_count))}</dd>
        </div>
        <div>
          <dt>Trace labels</dt>
          <dd>${escapeHtml(displayValue(traceLabels))}</dd>
        </div>
        <div>
          <dt>Origin type</dt>
          <dd>${escapeHtml(displayValue(origin.origin_type))}</dd>
        </div>
        <div>
          <dt>Origin reservoir</dt>
          <dd>${escapeHtml(displayValue(origin.origin_reservoir))}</dd>
        </div>
      </dl>

      ${
        node.governance_role
          ? `
            <details class="lab-graph-detail-raw">
              <summary>Governance role</summary>
              <pre>${escapeHtml(
                JSON.stringify(node.governance_role, null, 2)
              )}</pre>
            </details>
          `
          : ""
      }

      ${
        node.mri_behavior
          ? `
            <details class="lab-graph-detail-raw">
              <summary>MRI behavior</summary>
              <pre>${escapeHtml(
                JSON.stringify(node.mri_behavior, null, 2)
              )}</pre>
            </details>
          `
          : ""
      }
    `;
  }

  function focusNode(node) {
    if (!graphInstance || !node) return;

    const x = Number(node.x) || 0;
    const y = Number(node.y) || 0;
    const z = Number(node.z) || 0;
    const distance = Math.hypot(x, y, z);
    const ratio = 1 + 90 / Math.max(distance, 1);

    graphInstance.cameraPosition(
      {
        x: x * ratio,
        y: y * ratio,
        z: z * ratio
      },
      { x, y, z },
      900
    );
  }

  function updateGraphSize() {
    const container = document.getElementById("governanceGraph");

    if (!container || !graphInstance) return;

    const width = Math.floor(container.clientWidth);
    const height = Math.floor(container.clientHeight);

    if (width > 0 && height > 0) {
      graphInstance.width(width);
      graphInstance.height(height);
    }
  }

  function validateProjection(payload) {
    if (!payload || typeof payload !== "object") {
      throw new Error("The graph projection is not a JSON object.");
    }

    if (!Array.isArray(payload.nodes)) {
      throw new Error(
        "The graph projection does not contain a nodes array."
      );
    }

    if (!Array.isArray(payload.links)) {
      throw new Error(
        "The graph projection does not contain a links array."
      );
    }

    const nodeIds = new Set(
      payload.nodes.map((node) => node.id)
    );

    if (nodeIds.size !== payload.nodes.length) {
      throw new Error(
        "The graph projection contains duplicate node IDs."
      );
    }

    const invalidLink = payload.links.find(
      (link) =>
        !nodeIds.has(link.source) ||
        !nodeIds.has(link.target)
    );

    if (invalidLink) {
      throw new Error(
        `Attachment ${
          invalidLink.id || "unknown"
        } references a missing node.`
      );
    }
  }

  function initializeGraph(payload) {
    const container =
      document.getElementById("governanceGraph");

    if (!container) {
      throw new Error(
        "The governanceGraph container was not found."
      );
    }

    if (typeof window.ForceGraph3D !== "function") {
      throw new Error(
        "The 3D Force Graph library did not load."
      );
    }

    container.innerHTML = "";

    graphInstance = window
      .ForceGraph3D()(container)
      .backgroundColor("#07111d")
      .showNavInfo(false)
      .graphData(payload)
      .nodeId("id")
      .nodeLabel((node) => {
        const name =
          node.name ||
          node.label ||
          node.id;

        return `${name}<br><small>${
          node.node_family ||
          node.object_type ||
          "object"
        }</small>`;
      })
      .nodeColor(nodeColor)
      .nodeVal(nodeSize)
      .nodeOpacity(0.92)
      .linkColor(linkColor)
      .linkWidth(linkWidth)
      .linkOpacity(0.48)
      .linkDirectionalArrowLength(2.5)
      .linkDirectionalArrowRelPos(1)
      .onNodeClick((node) => {
        renderNodeDetails(node);
        focusNode(node);
      });

    graphInstance
      .d3Force("charge")
      ?.strength(-95);

    graphInstance
      .d3Force("link")
      ?.distance((link) => {
        if (
          link.attachment_type ===
          "distortion_cluster_membership"
        ) {
          return 34;
        }

        if (
          link.attachment_type ===
          "region_membership"
        ) {
          return 70;
        }

        return 48;
      });

    updateGraphSize();

    if (resizeObserver) {
      resizeObserver.disconnect();
    }

    resizeObserver =
      new ResizeObserver(updateGraphSize);

    resizeObserver.observe(container);

    const metadata =
      payload.projection_metadata || {};

    const customer =
      metadata.customer_id ||
      "Virelia Consulting";

    setGraphStatus(
      `${customer} governance graph loaded: ` +
        `${payload.nodes.length} nodes and ` +
        `${payload.links.length} links.`,
      "ready"
    );
  }

  async function loadGraph() {
    if (initialized) return;

    initialized = true;

    renderGraphMessage(
      "Loading Governance MRI",
      "Reading the Virelia Consulting structural projection…"
    );

    setGraphStatus(
      "Loading governance graph.",
      "loading"
    );

    try {
      const response = await fetch(
        GRAPH_DATA_URL,
        {
          method: "GET",
          cache: "no-store"
        }
      );

      if (!response.ok) {
        throw new Error(
          `Graph data returned HTTP ${response.status}.`
        );
      }

      graphPayload =
        await response.json();

      validateProjection(graphPayload);
      initializeGraph(graphPayload);
    } catch (error) {
      initialized = false;

      console.error(
        "Governance MRI graph failed to load.",
        error
      );

      renderGraphMessage(
        "Governance MRI unavailable",
        error instanceof Error
          ? error.message
          : String(error)
      );

      setGraphStatus(
        "Governance graph failed to load.",
        "error"
      );
    }
  }

  function startWhenReady() {
    const container =
      document.getElementById("governanceGraph");

    if (!container) return;

    // labAuthorized begins hidden. Wait until authorization
    // reveals the panel and the browser can calculate a usable
    // graph size.
    const attemptStart = () => {
      if (
        container.clientWidth > 0 &&
        container.clientHeight > 0
      ) {
        loadGraph();
        return;
      }

      window.setTimeout(
        attemptStart,
        150
      );
    };

    attemptStart();
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      startWhenReady
    );
  } else {
    startWhenReady();
  }
})();
