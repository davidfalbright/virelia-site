// lab/lab-graph.js
// Read-only Virelia Governance MRI structural graph.
// Loads a Projection Engine artifact prepared for 3d-force-graph.

(function () {
  "use strict";

  const GRAPH_DATA_URL =
    "lab/data/Virelia_Consulting_view_cache_3d_force_graph_TEST_DATA.json";

  /*
   * Governance colors
   *
   * Red family:
   *   Root Safeguard   = bright cherry red
   *   Domain Safeguard = medium red
   *   Article          = light red
   *
   * Green family:
   *   Root Conviction   = bright neon green
   *   Domain Conviction = medium green
   *   Principle         = light green
   *
   * Distortion families use separate grey shades.
   * Diagnostic distortion members inherit the grey used by their
   * parent Distortion Cluster.
   */

  const NODE_COLORS = Object.freeze({
    root_safeguard: "#ff1744",
    domain_safeguard: "#c93f4f",
    article: "#ff9aa8",

    root_conviction: "#39ff14",
    domain_conviction: "#2fa84f",
    principle: "#a8f5b8",

    region: "#f2c65b",
    cluster: "#4fb3e8",

    distortion_cognitive: "#e1e5ea",
    distortion_frame: "#aeb5be",
    distortion_identity_defense: "#737d89",
    distortion_moral: "#444c57",
    distortion_unknown: "#8d96a1",

    default: "#a8b7c5"
  });

  const LEGEND_ITEMS = Object.freeze([
    ["Root Conviction", NODE_COLORS.root_conviction],
    ["Domain Conviction", NODE_COLORS.domain_conviction],
    ["Principle", NODE_COLORS.principle],

    ["Root Safeguard", NODE_COLORS.root_safeguard],
    ["Domain Safeguard", NODE_COLORS.domain_safeguard],
    ["Article", NODE_COLORS.article],

    ["Cognitive Distortion", NODE_COLORS.distortion_cognitive],
    ["Frame Distortion", NODE_COLORS.distortion_frame],
    [
      "Identity Defense Distortion",
      NODE_COLORS.distortion_identity_defense
    ],
    ["Moral Distortion", NODE_COLORS.distortion_moral],

    ["Region", NODE_COLORS.region],
    ["Governance Cluster", NODE_COLORS.cluster]
  ]);

  const DISTORTION_CLUSTER_COLORS = Object.freeze({
    "D-ETH-CL-9001": NODE_COLORS.distortion_cognitive,
    "D-ETH-CL-9002": NODE_COLORS.distortion_frame,
    "D-ETH-CL-9003": NODE_COLORS.distortion_identity_defense,
    "D-ETH-CL-9004": NODE_COLORS.distortion_moral
  });

  let graphInstance = null;
  let graphPayload = null;
  let resizeObserver = null;
  let initialized = false;

  /*
   * Maps each diagnostic distortion node ID to its parent
   * Distortion Cluster ID.
   */

  const distortionClusterByNodeId = new Map();

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalizeValue(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase();
  }

  function displayValue(value) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return "Not recorded";
    }

    if (Array.isArray(value)) {
      return value.length
        ? value.join(", ")
        : "None";
    }

    if (typeof value === "object") {
      return JSON.stringify(
        value,
        null,
        2
      );
    }

    return String(value);
  }

  function isRootObject(node) {
    const subdomain =
      normalizeValue(node.subdomain_name);

    const originReservoir =
      normalizeValue(
        node.origin?.origin_reservoir
      );

    const id =
      String(node.id || "")
        .toUpperCase();

    return (
      subdomain === "root" ||
      originReservoir === "root" ||
      id.startsWith("R-")
    );
  }

  function classifyNode(node) {
    const family =
      normalizeValue(node.node_family);

    const objectType =
      normalizeValue(node.object_type);

    if (
      family === "safeguard" ||
      objectType === "safeguard"
    ) {
      return isRootObject(node)
        ? "root_safeguard"
        : "domain_safeguard";
    }

    if (
      family === "article" ||
      objectType === "article"
    ) {
      return "article";
    }

    if (
      family === "conviction" ||
      objectType === "conviction"
    ) {
      return isRootObject(node)
        ? "root_conviction"
        : "domain_conviction";
    }

    if (
      family === "principle" ||
      objectType === "principle"
    ) {
      return "principle";
    }

    if (family === "region") {
      return "region";
    }

    if (family === "distortion_cluster") {
      return "distortion_cluster";
    }

    if (family === "diagnostic_distortion") {
      return "diagnostic_distortion";
    }

    if (family === "cluster") {
      return "cluster";
    }

    return "default";
  }

  function distortionColorForNode(node) {
    const family =
      normalizeValue(node.node_family);

    if (family === "distortion_cluster") {
      return (
        DISTORTION_CLUSTER_COLORS[node.id] ||
        NODE_COLORS.distortion_unknown
      );
    }

    if (family === "diagnostic_distortion") {
      const parentClusterId =
        distortionClusterByNodeId.get(
          node.id
        );

      return (
        DISTORTION_CLUSTER_COLORS[
          parentClusterId
        ] ||
        NODE_COLORS.distortion_unknown
      );
    }

    return null;
  }

  function nodeColor(node) {
    const distortionColor =
      distortionColorForNode(node);

    if (distortionColor) {
      return distortionColor;
    }

    const classification =
      classifyNode(node);

    return (
      NODE_COLORS[classification] ||
      NODE_COLORS.default
    );
  }

  function nodeSize(node) {
    const suggested =
      Number(node.size_hint);

    if (
      Number.isFinite(suggested) &&
      suggested > 0
    ) {
      return suggested;
    }

    return 3;
  }

  function linkWidth(link) {
    const influence =
      Number(link.max_influence_strength);

    if (
      Number.isFinite(influence) &&
      influence > 0
    ) {
      /*
       * Current distortion membership links may use large
       * influence values. Clamp their visual width so they
       * remain readable without overwhelming the topology.
       */

      return Math.min(
        4,
        0.7 + influence * 0.03
      );
    }

    return 0.7;
  }

  function linkColor(link) {
    if (
      link.attachment_type ===
      "distortion_cluster_membership"
    ) {
      const sourceId =
        typeof link.source === "object"
          ? link.source.id
          : link.source;

      const targetId =
        typeof link.target === "object"
          ? link.target.id
          : link.target;

      const clusterId =
        DISTORTION_CLUSTER_COLORS[targetId]
          ? targetId
          : sourceId;

      return (
        DISTORTION_CLUSTER_COLORS[
          clusterId
        ] ||
        NODE_COLORS.distortion_unknown
      );
    }

    if (
      link.attachment_type ===
      "distortion_cluster_region_projection"
    ) {
      return "rgba(154, 163, 175, 0.48)";
    }

    if (
      link.attachment_type ===
      "region_membership"
    ) {
      return "rgba(242, 198, 91, 0.48)";
    }

    return "rgba(128, 183, 224, 0.38)";
  }

  function buildDistortionMembershipIndex(
    payload
  ) {
    distortionClusterByNodeId.clear();

    payload.links.forEach((link) => {
      if (
        link.attachment_type !==
        "distortion_cluster_membership"
      ) {
        return;
      }

      const sourceId =
        typeof link.source === "object"
          ? link.source.id
          : link.source;

      const targetId =
        typeof link.target === "object"
          ? link.target.id
          : link.target;

      if (
        DISTORTION_CLUSTER_COLORS[
          targetId
        ]
      ) {
        distortionClusterByNodeId.set(
          sourceId,
          targetId
        );
      } else if (
        DISTORTION_CLUSTER_COLORS[
          sourceId
        ]
      ) {
        distortionClusterByNodeId.set(
          targetId,
          sourceId
        );
      }
    });
  }

  function setGraphStatus(
    message,
    state
  ) {
    const container =
      document.getElementById(
        "governanceGraph"
      );

    if (!container) {
      return;
    }

    container.dataset.graphState =
      state || "";

    container.setAttribute(
      "aria-label",
      message
    );
  }

  function renderGraphMessage(
    title,
    message
  ) {
    const container =
      document.getElementById(
        "governanceGraph"
      );

    if (!container) {
      return;
    }

    container.innerHTML = `
      <div class="lab-graph-message">
        <strong>
          ${escapeHtml(title)}
        </strong>

        <span>
          ${escapeHtml(message)}
        </span>
      </div>
    `;
  }

  function renderLegend() {
    const mriPanel =
      document.querySelector(
        ".lab-mri-panel"
      );

    const graphLayout =
      document.querySelector(
        ".lab-mri-layout"
      );

    if (
      !mriPanel ||
      !graphLayout
    ) {
      return;
    }

    const existingLegend =
      mriPanel.querySelector(
        ".lab-graph-legend"
      );

    if (existingLegend) {
      existingLegend.remove();
    }

    const legend =
      document.createElement("div");

    legend.className =
      "lab-graph-legend";

    legend.setAttribute(
      "aria-label",
      "Governance MRI color legend"
    );

    legend.innerHTML = `
      <div class="lab-graph-legend-title">
        Graph Legend
      </div>

      <div class="lab-graph-legend-items">
        ${LEGEND_ITEMS.map(
          ([label, color]) => {
            return `
              <div class="lab-graph-legend-row">
                <span
                  class="lab-graph-legend-swatch"
                  style="background: ${escapeHtml(
                    color
                  )};"
                ></span>

                <span>
                  ${escapeHtml(label)}
                </span>
              </div>
            `;
          }
        ).join("")}
      </div>
    `;

    mriPanel.insertBefore(
      legend,
      graphLayout
    );
  }

  function renderNodeDetails(node) {
    const title =
      document.getElementById(
        "graphDetailTitle"
      );

    const content =
      document.getElementById(
        "graphDetailContent"
      );

    if (
      !title ||
      !content
    ) {
      return;
    }

    title.textContent =
      node.name ||
      node.label ||
      node.id ||
      "Selected object";

    const traceLabels =
      Array.isArray(node.trace_labels)
        ? node.trace_labels
        : [];

    const origin =
      node.origin &&
      typeof node.origin === "object"
        ? node.origin
        : {};

    const classification =
      classifyNode(node);

    const parentDistortionClusterId =
      distortionClusterByNodeId.get(
        node.id
      );

    content.innerHTML = `
      <dl class="lab-graph-detail-list">
        <div>
          <dt>Object ID</dt>
          <dd>
            ${escapeHtml(
              displayValue(node.id)
            )}
          </dd>
        </div>

        <div>
          <dt>Family</dt>
          <dd>
            ${escapeHtml(
              displayValue(
                node.node_family
              )
            )}
          </dd>
        </div>

        <div>
          <dt>Visual class</dt>
          <dd>
            ${escapeHtml(
              displayValue(
                classification
              )
            )}
          </dd>
        </div>

        ${
          parentDistortionClusterId
            ? `
              <div>
                <dt>
                  Distortion cluster
                </dt>

                <dd>
                  ${escapeHtml(
                    parentDistortionClusterId
                  )}
                </dd>
              </div>
            `
            : ""
        }

        <div>
          <dt>Object type</dt>
          <dd>
            ${escapeHtml(
              displayValue(
                node.object_type
              )
            )}
          </dd>
        </div>

        <div>
          <dt>Status</dt>
          <dd>
            ${escapeHtml(
              displayValue(
                node.status
              )
            )}
          </dd>
        </div>

        <div>
          <dt>Domain</dt>
          <dd>
            ${escapeHtml(
              displayValue(
                node.domain_name
              )
            )}
          </dd>
        </div>

        <div>
          <dt>Subdomain</dt>
          <dd>
            ${escapeHtml(
              displayValue(
                node.subdomain_name
              )
            )}
          </dd>
        </div>

        <div>
          <dt>
            Energizing threshold
          </dt>

          <dd>
            ${escapeHtml(
              displayValue(
                node.energizing_threshold
              )
            )}
          </dd>
        </div>

        <div>
          <dt>
            Compiled attachments
          </dt>

          <dd>
            ${escapeHtml(
              displayValue(
                node.attachment_count
              )
            )}
          </dd>
        </div>

        <div>
          <dt>Trace labels</dt>
          <dd>
            ${escapeHtml(
              displayValue(
                traceLabels
              )
            )}
          </dd>
        </div>

        <div>
          <dt>Origin type</dt>
          <dd>
            ${escapeHtml(
              displayValue(
                origin.origin_type
              )
            )}
          </dd>
        </div>

        <div>
          <dt>
            Origin reservoir
          </dt>

          <dd>
            ${escapeHtml(
              displayValue(
                origin.origin_reservoir
              )
            )}
          </dd>
        </div>
      </dl>

      ${
        node.governance_role
          ? `
            <details
              class="lab-graph-detail-raw"
            >
              <summary>
                Governance role
              </summary>

              <pre>${escapeHtml(
                JSON.stringify(
                  node.governance_role,
                  null,
                  2
                )
              )}</pre>
            </details>
          `
          : ""
      }

      ${
        node.mri_behavior
          ? `
            <details
              class="lab-graph-detail-raw"
            >
              <summary>
                MRI behavior
              </summary>

              <pre>${escapeHtml(
                JSON.stringify(
                  node.mri_behavior,
                  null,
                  2
                )
              )}</pre>
            </details>
          `
          : ""
      }
    `;
  }

  function focusNode(node) {
    if (
      !graphInstance ||
      !node
    ) {
      return;
    }

    const x =
      Number(node.x) || 0;

    const y =
      Number(node.y) || 0;

    const z =
      Number(node.z) || 0;

    const distance =
      Math.hypot(x, y, z);

    const ratio =
      1 +
      90 /
        Math.max(
          distance,
          1
        );

    graphInstance.cameraPosition(
      {
        x: x * ratio,
        y: y * ratio,
        z: z * ratio
      },
      {
        x,
        y,
        z
      },
      900
    );
  }

  function updateGraphSize() {
    const container =
      document.getElementById(
        "governanceGraph"
      );

    if (
      !container ||
      !graphInstance
    ) {
      return;
    }

    const width =
      Math.floor(
        container.clientWidth
      );

    const height =
      Math.floor(
        container.clientHeight
      );

    if (
      width > 0 &&
      height > 0
    ) {
      graphInstance.width(width);
      graphInstance.height(height);
    }
  }

  function validateProjection(
    payload
  ) {
    if (
      !payload ||
      typeof payload !== "object"
    ) {
      throw new Error(
        "The graph projection is not a JSON object."
      );
    }

    if (
      !Array.isArray(
        payload.nodes
      )
    ) {
      throw new Error(
        "The graph projection does not contain a nodes array."
      );
    }

    if (
      !Array.isArray(
        payload.links
      )
    ) {
      throw new Error(
        "The graph projection does not contain a links array."
      );
    }

    const nodeIds =
      new Set(
        payload.nodes.map(
          (node) => node.id
        )
      );

    if (
      nodeIds.size !==
      payload.nodes.length
    ) {
      throw new Error(
        "The graph projection contains duplicate node IDs."
      );
    }

    const invalidLink =
      payload.links.find(
        (link) => {
          const sourceId =
            typeof link.source ===
            "object"
              ? link.source.id
              : link.source;

          const targetId =
            typeof link.target ===
            "object"
              ? link.target.id
              : link.target;

          return (
            !nodeIds.has(sourceId) ||
            !nodeIds.has(targetId)
          );
        }
      );

    if (invalidLink) {
      throw new Error(
        `Attachment ${
          invalidLink.id ||
          "unknown"
        } references a missing node.`
      );
    }
  }

  function initializeGraph(
    payload
  ) {
    const container =
      document.getElementById(
        "governanceGraph"
      );

    if (!container) {
      throw new Error(
        "The governanceGraph container was not found."
      );
    }

    if (
      typeof window.ForceGraph3D !==
      "function"
    ) {
      throw new Error(
        "The 3D Force Graph library did not load."
      );
    }

    buildDistortionMembershipIndex(
      payload
    );

    container.innerHTML = "";

    graphInstance =
      window
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

          const classification =
            classifyNode(node)
              .replaceAll(
                "_",
                " "
              );

          return `
            ${escapeHtml(name)}
            <br>
            <small>
              ${escapeHtml(
                classification
              )}
            </small>
          `;
        })
        .nodeColor(nodeColor)
        .nodeVal(nodeSize)
        .nodeOpacity(0.94)
        .linkColor(linkColor)
        .linkWidth(linkWidth)
        .linkOpacity(0.5)
        .linkDirectionalArrowLength(
          2.5
        )
        .linkDirectionalArrowRelPos(
          1
        )
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
    renderLegend();

    if (resizeObserver) {
      resizeObserver.disconnect();
    }

    resizeObserver =
      new ResizeObserver(
        updateGraphSize
      );

    resizeObserver.observe(
      container
    );

    const metadata =
      payload.projection_metadata ||
      {};

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
    if (initialized) {
      return;
    }

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
      const response =
        await fetch(
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

      validateProjection(
        graphPayload
      );

      initializeGraph(
        graphPayload
      );
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
      document.getElementById(
        "governanceGraph"
      );

    if (!container) {
      return;
    }

    /*
     * labAuthorized begins hidden.
     * Wait until authorization reveals the panel and the browser
     * can calculate a usable graph size.
     */

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

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      startWhenReady
    );
  } else {
    startWhenReady();
  }
})();
