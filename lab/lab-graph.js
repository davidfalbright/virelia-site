// lab/lab-graph.js
// Read-only Virelia Governance MRI structural graph.
// Loads a Projection Engine artifact prepared for 3d-force-graph.

(function () {
  "use strict";

  const GRAPH_DATA_URL =
    "lab/data/Virelia_Consulting_view_cache_3d_force_graph_TEST_DATA.json";

  /*
   * Future Right Brain Domains are shown in the filter interface even
   * before the current projection contains objects for all of them.
   */

  const RIGHT_BRAIN_PLACEHOLDER_DOMAINS = Object.freeze([
    "Emotional State",
    "Personality and Temperament",
    "Social and Relational Context",
    "Interaction and Delivery",
    "Experiential Response",
    "Rhetoric and Manipulation"
  ]);

  /*
   * Left Brain colors
   */

  const LEFT_COLORS = Object.freeze({
    root_conviction: "#39ff14",
    domain_conviction: "#2fa84f",
    principle: "#a8f5b8",

    root_safeguard: "#ff1744",
    domain_safeguard: "#c93f4f",
    article: "#ff9aa8",

    region: "#f2c65b",
    cluster: "#4fb3e8",

    default: "#a8b7c5"
  });

  /*
   * Right Brain colors use the same architectural object types,
   * but a separate visual palette.
   */

  const RIGHT_COLORS = Object.freeze({
    root_conviction: "#00f5ff",
    domain_conviction: "#238fa8",
    principle: "#a8edf5",

    root_safeguard: "#ff2bd6",
    domain_safeguard: "#b94fc5",
    article: "#e9a8ef",

    region: "#ff9d3d",
    cluster: "#8d6cff",

    default: "#a8b7c5"
  });

  /*
   * Current diagnostic Distortion Clusters.
   *
   * The requested order is darkest at the top of the legend and
   * lightest at the bottom.
   */

  const DISTORTION_COLORS = Object.freeze({
    moral: "#444c57",
    identity_defense: "#737d89",
    frame: "#aeb5be",
    cognitive: "#e1e5ea",
    unknown: "#8d96a1"
  });

  const DISTORTION_CLUSTER_DETAILS = Object.freeze({
    "D-ETH-CL-9004": {
      label: "Moral Distortion",
      color: DISTORTION_COLORS.moral
    },
    "D-ETH-CL-9003": {
      label: "Identity Defense Distortion",
      color: DISTORTION_COLORS.identity_defense
    },
    "D-ETH-CL-9002": {
      label: "Frame Distortion",
      color: DISTORTION_COLORS.frame
    },
    "D-ETH-CL-9001": {
      label: "Cognitive Distortion",
      color: DISTORTION_COLORS.cognitive
    }
  });

  let graphInstance = null;
  let graphPayload = null;
  let canonicalGraphData = null;
  let resizeObserver = null;
  let initialized = false;
  let selectedNodeId = null;

  /*
   * Maps each individual diagnostic distortion to its parent
   * Distortion Cluster.
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

  function titleCase(value) {
    return String(value ?? "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (character) => character.toUpperCase());
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
      return JSON.stringify(value, null, 2);
    }

    return String(value);
  }

  function linkEndpointId(endpoint) {
    if (
      endpoint &&
      typeof endpoint === "object"
    ) {
      return endpoint.id;
    }

    return endpoint;
  }

  function cloneCanonicalGraphData(payload) {
    return {
      nodes: payload.nodes.map((node) => ({
        ...node
      })),

      links: payload.links.map((link) => ({
        ...link,
        source: linkEndpointId(link.source),
        target: linkEndpointId(link.target)
      }))
    };
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

  function classifyArchitecturalObject(node) {
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

    if (
      family === "cluster" ||
      family === "distortion_cluster"
    ) {
      return "cluster";
    }

    if (
      family === "diagnostic_distortion"
    ) {
      return "diagnostic_distortion";
    }

    return "default";
  }

  function inferBrainSide(node) {
    const explicitSide =
      normalizeValue(
        node.brain_side ||
        node.processing_side ||
        node.hemisphere
      );

    if (
      explicitSide === "left" ||
      explicitSide === "left_brain"
    ) {
      return "left";
    }

    if (
      explicitSide === "right" ||
      explicitSide === "right_brain"
    ) {
      return "right";
    }

    const family =
      normalizeValue(node.node_family);

    if (
      family === "diagnostic_distortion" ||
      family === "distortion_cluster"
    ) {
      return "right";
    }

    const reservoir =
      normalizeValue(
        node.origin?.origin_reservoir
      );

    if (
      reservoir.includes("response") ||
      reservoir === "rrr" ||
      reservoir === "drr"
    ) {
      return "right";
    }

    if (
      reservoir.includes("ethical") ||
      reservoir === "rer" ||
      reservoir === "der"
    ) {
      return "left";
    }

    const domain =
      normalizeValue(node.domain_name);

    if (
      domain.includes("emotion") ||
      domain.includes("personality") ||
      domain.includes("temperament") ||
      domain.includes("response") ||
      domain.includes("delivery") ||
      domain.includes("rhetoric") ||
      domain.includes("interaction") ||
      domain.includes("experiential")
    ) {
      return "right";
    }

    return "left";
  }

  function inferFilterDomain(node) {
    const family =
      normalizeValue(node.node_family);

    if (
      family === "diagnostic_distortion" ||
      family === "distortion_cluster"
    ) {
      return "Rhetoric and Manipulation";
    }

    const explicitDomain =
      node.domain_display_name ||
      node.domain_name ||
      node.domain_id;

    if (explicitDomain) {
      return titleCase(explicitDomain);
    }

    return inferBrainSide(node) === "right"
      ? "Unclassified Right Brain"
      : "Unclassified Left Brain";
  }

  function distortionColorForNode(node) {
    const family =
      normalizeValue(node.node_family);

    if (family === "distortion_cluster") {
      return (
        DISTORTION_CLUSTER_DETAILS[
          node.id
        ]?.color ||
        DISTORTION_COLORS.unknown
      );
    }

    if (family === "diagnostic_distortion") {
      const parentClusterId =
        distortionClusterByNodeId.get(
          node.id
        );

      return (
        DISTORTION_CLUSTER_DETAILS[
          parentClusterId
        ]?.color ||
        DISTORTION_COLORS.unknown
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

    const brainSide =
      inferBrainSide(node);

    const classification =
      classifyArchitecturalObject(node);

    const palette =
      brainSide === "right"
        ? RIGHT_COLORS
        : LEFT_COLORS;

    return (
      palette[classification] ||
      palette.default
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
        linkEndpointId(link.source);

      const targetId =
        linkEndpointId(link.target);

      const clusterId =
        DISTORTION_CLUSTER_DETAILS[
          targetId
        ]
          ? targetId
          : sourceId;

      return (
        DISTORTION_CLUSTER_DETAILS[
          clusterId
        ]?.color ||
        DISTORTION_COLORS.unknown
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

  function buildDistortionMembershipIndex(payload) {
    distortionClusterByNodeId.clear();

    payload.links.forEach((link) => {
      if (
        link.attachment_type !==
        "distortion_cluster_membership"
      ) {
        return;
      }

      const sourceId =
        linkEndpointId(link.source);

      const targetId =
        linkEndpointId(link.target);

      if (
        DISTORTION_CLUSTER_DETAILS[
          targetId
        ]
      ) {
        distortionClusterByNodeId.set(
          sourceId,
          targetId
        );
      } else if (
        DISTORTION_CLUSTER_DETAILS[
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

  function setGraphStatus(message, state) {
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

  function renderGraphMessage(title, message) {
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

  function legendRow(label, color, isPlaceholder) {
    return `
      <div class="lab-graph-legend-row${
        isPlaceholder
          ? " is-placeholder"
          : ""
      }">
        <span
          class="lab-graph-legend-swatch"
          style="background: ${escapeHtml(color)};"
        ></span>

        <span>
          ${escapeHtml(label)}
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
      document.createElement("section");

    legend.className =
      "lab-graph-legend";

    legend.setAttribute(
      "aria-label",
      "Governance MRI architectural color legend"
    );

    legend.innerHTML = `
      <div class="lab-graph-legend-title">
        Graph Legend
      </div>

      <div class="lab-graph-legend-brains">
        <section class="lab-graph-legend-brain">
          <div class="lab-graph-legend-brain-title">
            Left Brain
          </div>

          <div class="lab-graph-legend-columns">
            <div class="lab-graph-legend-column">
              <div class="lab-graph-legend-column-title">
                Convictions
              </div>

              ${legendRow(
                "Root Conviction",
                LEFT_COLORS.root_conviction,
                false
              )}

              ${legendRow(
                "Domain Conviction",
                LEFT_COLORS.domain_conviction,
                false
              )}

              ${legendRow(
                "Principle",
                LEFT_COLORS.principle,
                false
              )}
            </div>

            <div class="lab-graph-legend-column">
              <div class="lab-graph-legend-column-title">
                Safeguards
              </div>

              ${legendRow(
                "Root Safeguard",
                LEFT_COLORS.root_safeguard,
                false
              )}

              ${legendRow(
                "Domain Safeguard",
                LEFT_COLORS.domain_safeguard,
                false
              )}

              ${legendRow(
                "Article",
                LEFT_COLORS.article,
                false
              )}
            </div>

            <div class="lab-graph-legend-column">
              <div class="lab-graph-legend-column-title">
                Reserved
              </div>

              <div class="lab-graph-legend-row is-placeholder">
                Left Brain Domains use the same architectural objects.
              </div>
            </div>

            <div class="lab-graph-legend-column">
              <div class="lab-graph-legend-column-title">
                Structure
              </div>

              ${legendRow(
                "Region",
                LEFT_COLORS.region,
                false
              )}

              ${legendRow(
                "Cluster",
                LEFT_COLORS.cluster,
                false
              )}
            </div>
          </div>
        </section>

        <section class="lab-graph-legend-brain">
          <div class="lab-graph-legend-brain-title">
            Right Brain
          </div>

          <div class="lab-graph-legend-columns">
            <div class="lab-graph-legend-column">
              <div class="lab-graph-legend-column-title">
                Convictions
              </div>

              ${legendRow(
                "Root Conviction",
                RIGHT_COLORS.root_conviction,
                true
              )}

              ${legendRow(
                "Domain Conviction",
                RIGHT_COLORS.domain_conviction,
                true
              )}

              ${legendRow(
                "Principle",
                RIGHT_COLORS.principle,
                true
              )}
            </div>

            <div class="lab-graph-legend-column">
              <div class="lab-graph-legend-column-title">
                Safeguards
              </div>

              ${legendRow(
                "Root Safeguard",
                RIGHT_COLORS.root_safeguard,
                true
              )}

              ${legendRow(
                "Domain Safeguard",
                RIGHT_COLORS.domain_safeguard,
                true
              )}

              ${legendRow(
                "Article",
                RIGHT_COLORS.article,
                true
              )}
            </div>

            <div class="lab-graph-legend-column">
              <div class="lab-graph-legend-column-title">
                Distortion Clusters
              </div>

              ${legendRow(
                "Moral Distortion",
                DISTORTION_COLORS.moral,
                false
              )}

              ${legendRow(
                "Identity Defense Distortion",
                DISTORTION_COLORS.identity_defense,
                false
              )}

              ${legendRow(
                "Frame Distortion",
                DISTORTION_COLORS.frame,
                false
              )}

              ${legendRow(
                "Cognitive Distortion",
                DISTORTION_COLORS.cognitive,
                false
              )}
            </div>

            <div class="lab-graph-legend-column">
              <div class="lab-graph-legend-column-title">
                Structure
              </div>

              ${legendRow(
                "Region",
                RIGHT_COLORS.region,
                true
              )}

              ${legendRow(
                "Cluster",
                RIGHT_COLORS.cluster,
                true
              )}
            </div>
          </div>
        </section>
      </div>
    `;

    mriPanel.insertBefore(
      legend,
      graphLayout
    );
  }

  function uniqueDomainsForSide(side) {
    const domains =
      canonicalGraphData.nodes
        .filter(
          (node) =>
            inferBrainSide(node) === side
        )
        .map(inferFilterDomain);

    return Array.from(
      new Set(domains)
    ).sort((a, b) =>
      a.localeCompare(b)
    );
  }

  function filterOptionMarkup(
    side,
    domain,
    available
  ) {
    const normalizedDomain =
      domain
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase();

    const inputId =
      `graph-filter-${side}-${normalizedDomain}`;

    return `
      <label
        class="lab-graph-filter-option${
          available
            ? ""
            : " is-unavailable"
        }"
        for="${escapeHtml(inputId)}"
      >
        <input
          id="${escapeHtml(inputId)}"
          type="checkbox"
          data-graph-filter-side="${escapeHtml(side)}"
          data-graph-filter-domain="${escapeHtml(domain)}"
          ${
            available
              ? "checked"
              : "disabled"
          }
        >

        <span>
          ${escapeHtml(domain)}
          ${
            available
              ? ""
              : " — not in this dataset"
          }
        </span>
      </label>
    `;
  }

  function renderFilterControls() {
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
      !graphLayout ||
      !canonicalGraphData
    ) {
      return;
    }

    const existingControls =
      mriPanel.querySelector(
        ".lab-graph-controls"
      );

    if (existingControls) {
      existingControls.remove();
    }

    const leftDomains =
      uniqueDomainsForSide("left");

    const availableRightDomains =
      uniqueDomainsForSide("right");

    const rightDomains =
      Array.from(
        new Set([
          ...availableRightDomains,
          ...RIGHT_BRAIN_PLACEHOLDER_DOMAINS
        ])
      );

    const controls =
      document.createElement("section");

    controls.className =
      "lab-graph-controls";

    controls.setAttribute(
      "aria-label",
      "Governance MRI graph filters"
    );

    controls.innerHTML = `
      <section class="lab-graph-filter-group">
        <div class="lab-graph-filter-heading">
          <h3>Left Brain</h3>

          <span class="lab-graph-filter-status">
            ${leftDomains.length}
            domain${
              leftDomains.length === 1
                ? ""
                : "s"
            }
          </span>
        </div>

        <div class="lab-graph-filter-list">
          <label
            class="lab-graph-filter-option is-master"
            for="graph-filter-left-all"
          >
            <input
              id="graph-filter-left-all"
              type="checkbox"
              data-graph-filter-master="left"
              checked
            >

            <span>
              All Left Brain Domains
            </span>
          </label>

          ${leftDomains
            .map((domain) =>
              filterOptionMarkup(
                "left",
                domain,
                true
              )
            )
            .join("")}
        </div>
      </section>

      <section class="lab-graph-filter-group">
        <div class="lab-graph-filter-heading">
          <h3>Right Brain</h3>

          <span class="lab-graph-filter-status">
            ${availableRightDomains.length}
            available
          </span>
        </div>

        <div class="lab-graph-filter-list">
          <label
            class="lab-graph-filter-option is-master"
            for="graph-filter-right-all"
          >
            <input
              id="graph-filter-right-all"
              type="checkbox"
              data-graph-filter-master="right"
              ${
                availableRightDomains.length
                  ? "checked"
                  : ""
              }
            >

            <span>
              All Available Right Brain Domains
            </span>
          </label>

          ${rightDomains
            .map((domain) =>
              filterOptionMarkup(
                "right",
                domain,
                availableRightDomains.includes(
                  domain
                )
              )
            )
            .join("")}
        </div>
      </section>

      <div
        id="graphFilterSummary"
        class="lab-graph-filter-summary"
      >
        <span>
          Choose any combination of Left Brain and Right Brain
          Domains, then select <strong>Replay Run</strong>.
        </span>

        <span id="graphVisibleCount">
          Full structural projection loaded.
        </span>
      </div>
    `;

    mriPanel.insertBefore(
      controls,
      graphLayout
    );

    bindFilterEvents();
  }

  function availableCheckboxesForSide(side) {
    return Array.from(
      document.querySelectorAll(
        `input[data-graph-filter-side="${side}"]:not(:disabled)`
      )
    );
  }

  function updateMasterCheckbox(side) {
    const master =
      document.querySelector(
        `input[data-graph-filter-master="${side}"]`
      );

    if (!master) {
      return;
    }

    const children =
      availableCheckboxesForSide(side);

    const checkedCount =
      children.filter(
        (checkbox) =>
          checkbox.checked
      ).length;

    master.checked =
      children.length > 0 &&
      checkedCount === children.length;

    master.indeterminate =
      checkedCount > 0 &&
      checkedCount < children.length;
  }

  function bindFilterEvents() {
    document
      .querySelectorAll(
        "input[data-graph-filter-master]"
      )
      .forEach((master) => {
        master.addEventListener(
          "change",
          () => {
            const side =
              master.dataset
                .graphFilterMaster;

            availableCheckboxesForSide(
              side
            ).forEach((checkbox) => {
              checkbox.checked =
                master.checked;
            });

            master.indeterminate =
              false;
          }
        );
      });

    document
      .querySelectorAll(
        "input[data-graph-filter-side]"
      )
      .forEach((checkbox) => {
        checkbox.addEventListener(
          "change",
          () => {
            updateMasterCheckbox(
              checkbox.dataset
                .graphFilterSide
            );
          }
        );
      });

    const replayButton =
      document.getElementById(
        "replayRunButton"
      );

    if (replayButton) {
      replayButton.disabled = false;

      replayButton.addEventListener(
        "click",
        applySelectedFilters
      );
    }
  }

  function selectedDomainsForSide(side) {
    return new Set(
      availableCheckboxesForSide(side)
        .filter(
          (checkbox) =>
            checkbox.checked
        )
        .map(
          (checkbox) =>
            checkbox.dataset
              .graphFilterDomain
        )
    );
  }

  function resetInspector() {
    selectedNodeId = null;

    const title =
      document.getElementById(
        "graphDetailTitle"
      );

    const content =
      document.getElementById(
        "graphDetailContent"
      );

    if (title) {
      title.textContent =
        "Select an object";
    }

    if (content) {
      content.innerHTML = `
        <p>
          Select a Region, Cluster, Belief, Attachment,
          or verdict object to inspect its recorded state
          and ledger evidence.
        </p>
      `;
    }
  }

  function applySelectedFilters() {
    if (
      !canonicalGraphData ||
      !graphInstance
    ) {
      return;
    }

    const selectedLeftDomains =
      selectedDomainsForSide("left");

    const selectedRightDomains =
      selectedDomainsForSide("right");

    const visibleNodes =
      canonicalGraphData.nodes
        .filter((node) => {
          const side =
            inferBrainSide(node);

          const domain =
            inferFilterDomain(node);

          if (side === "right") {
            return selectedRightDomains.has(
              domain
            );
          }

          return selectedLeftDomains.has(
            domain
          );
        })
        .map((node) => ({
          ...node
        }));

    const visibleNodeIds =
      new Set(
        visibleNodes.map(
          (node) => node.id
        )
      );

    const visibleLinks =
      canonicalGraphData.links
        .filter((link) => {
          const sourceId =
            linkEndpointId(
              link.source
            );

          const targetId =
            linkEndpointId(
              link.target
            );

          return (
            visibleNodeIds.has(
              sourceId
            ) &&
            visibleNodeIds.has(
              targetId
            )
          );
        })
        .map((link) => ({
          ...link,
          source: linkEndpointId(
            link.source
          ),
          target: linkEndpointId(
            link.target
          )
        }));

    graphInstance.graphData({
      nodes: visibleNodes,
      links: visibleLinks
    });

    graphInstance
      .d3ReheatSimulation();

    if (
      selectedNodeId &&
      !visibleNodeIds.has(
        selectedNodeId
      )
    ) {
      resetInspector();
    }

    const countLabel =
      document.getElementById(
        "graphVisibleCount"
      );

    if (countLabel) {
      countLabel.textContent =
        `${visibleNodes.length} nodes and ` +
        `${visibleLinks.length} links visible.`;
    }

    window.setTimeout(() => {
      if (
        visibleNodes.length &&
        typeof graphInstance.zoomToFit ===
          "function"
      ) {
        graphInstance.zoomToFit(
          850,
          45
        );
      }
    }, 450);
  }

  function renderNodeDetails(node) {
    selectedNodeId =
      node.id || null;

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

    const brainSide =
      inferBrainSide(node);

    const classification =
      classifyArchitecturalObject(
        node
      );

    const filterDomain =
      inferFilterDomain(node);

    const parentDistortionClusterId =
      distortionClusterByNodeId.get(
        node.id
      );

    const parentDistortionLabel =
      DISTORTION_CLUSTER_DETAILS[
        parentDistortionClusterId
      ]?.label;

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
          <dt>Brain side</dt>
          <dd>
            ${escapeHtml(
              titleCase(brainSide)
            )}
          </dd>
        </div>

        <div>
          <dt>Filter Domain</dt>
          <dd>
            ${escapeHtml(
              filterDomain
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
              titleCase(
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
                  Distortion Cluster
                </dt>

                <dd>
                  ${escapeHtml(
                    parentDistortionLabel ||
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

  function validateProjection(payload) {
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
            linkEndpointId(
              link.source
            );

          const targetId =
            linkEndpointId(
              link.target
            );

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

  function initializeGraph(payload) {
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

    canonicalGraphData =
      cloneCanonicalGraphData(
        payload
      );

    container.innerHTML = "";

    const initialGraphData =
      cloneCanonicalGraphData(
        canonicalGraphData
      );

    graphInstance =
      window
        .ForceGraph3D()(container)
        .backgroundColor("#07111d")
        .showNavInfo(false)
        .graphData(initialGraphData)
        .nodeId("id")
        .nodeLabel((node) => {
          const name =
            node.name ||
            node.label ||
            node.id;

          const side =
            inferBrainSide(node);

          const classification =
            classifyArchitecturalObject(
              node
            );

          return `
            ${escapeHtml(name)}
            <br>
            <small>
              ${escapeHtml(
                titleCase(side)
              )}
              ·
              ${escapeHtml(
                titleCase(
                  classification
                )
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
    renderFilterControls();
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
     * labAuthorized begins hidden. Wait until authorization reveals
     * the panel and the browser can calculate a usable graph size.
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
