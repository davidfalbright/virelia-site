// lab/lab-graph.js
// Read-only Virelia Governance MRI structural graph.
// Loads a Projection Engine artifact prepared for 3d-force-graph.

(function () {
  "use strict";

  const GRAPH_DATA_URL =
    "lab/data/Virelia_Consulting_view_cache_3d_force_graph_TEST_DATA.json";

  const RIGHT_HEMISPHERE_PLACEHOLDER_DOMAINS = Object.freeze([
    "Emotional State",
    "Personality and Temperament",
    "Social and Relational Context",
    "Interaction and Delivery",
    "Experiential Response"
  ]);

  const LEFT_COLORS = Object.freeze({
    root_conviction: "#39ff14",
    domain_conviction: "#2fa84f",
    principle: "#a8f5b8",

    root_safeguard: "#ff1744",
    domain_safeguard: "#c93f4f",
    article: "#ff9aa8",
    exception: "#ffd36a",
    mitigation: "#f6b94b",

    cluster_domain: "#7fd4f2",
    cluster_multi_domain: "#4fb3e8",
    cluster_multi_hemisphere: "#496fd8",
    cluster: "#4fb3e8",

    default: "#a8b7c5"
  });

  const RIGHT_COLORS = Object.freeze({
    root_conviction: "#00f5ff",
    domain_conviction: "#238fa8",
    principle: "#a8edf5",

    root_safeguard: "#ff2bd6",
    domain_safeguard: "#b94fc5",
    article: "#e9a8ef",
    exception: "#ffbd6b",
    mitigation: "#ff9257",

    cluster_domain: "#b8a4ff",
    cluster_multi_domain: "#8d6cff",
    cluster_multi_hemisphere: "#6b42d8",
    cluster: "#8d6cff",

    default: "#a8b7c5"
  });

  const NEUTRAL_COLORS = Object.freeze({
    region: "#f2c65b",
    default: "#a8b7c5"
  });


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

  const ARCHITECTURAL_FILTERS = Object.freeze([
    { key: "root_conviction", label: "Root", column: "convictions" },
    { key: "domain_conviction", label: "Domain", column: "convictions" },
    { key: "principle", label: "Principle", column: "convictions" },
    { key: "root_safeguard", label: "Root", column: "safeguards" },
    { key: "domain_safeguard", label: "Domain", column: "safeguards" },
    { key: "article", label: "Article", column: "safeguards" },
    { key: "exception", label: "Exception", column: "safeguards" },
    { key: "mitigation", label: "Mitigation", column: "safeguards" }
  ]);

  const CLUSTER_REACH_FILTERS = Object.freeze([
    { key: "domain", label: "Domain" },
    { key: "multi_domain", label: "Multi-Domain" },
    { key: "multi_hemisphere", label: "Multi-Hemisphere" }
  ]);

  let graphInstance = null;
  let graphPayload = null;
  let canonicalGraphData = null;
  let resizeObserver = null;
  let initialized = false;
  let selectedNodeId = null;
  let appliedFilterSignature = "";

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
      .replace(/\b\w/g, (character) =>
        character.toUpperCase()
      );
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

  function cloneGraphData(data) {
    return {
      nodes: data.nodes.map((node) => ({
        ...node
      })),

      links: data.links.map((link) => ({
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

    const authorityLevel =
      normalizeValue(node.authority_level);

    const id =
      String(node.id || "")
        .toUpperCase();

    return (
      subdomain === "root" ||
      originReservoir === "root" ||
      authorityLevel === "root" ||
      id.startsWith("R-")
    );
  }

  function classifyArchitecturalObject(node) {
    const family = normalizeValue(node.node_family);
    const objectType = normalizeValue(node.object_type);

    if (family === "safeguard" || objectType === "safeguard") {
      return isRootObject(node) ? "root_safeguard" : "domain_safeguard";
    }
    if (family === "article" || objectType === "article") return "article";
    if (family === "exception" || objectType === "exception") return "exception";
    if (family === "mitigation" || objectType === "mitigation") return "mitigation";
    if (family === "conviction" || objectType === "conviction") {
      return isRootObject(node) ? "root_conviction" : "domain_conviction";
    }
    if (family === "principle" || objectType === "principle") return "principle";
    if (family === "region") return "region";
    if (["cluster", "distortion_cluster", "emotional_cluster"].includes(family)) return "cluster";
    if (family === "diagnostic_distortion") return "cluster";
    return "default";
  }

  function inferHemisphere(node) {
    const family = normalizeValue(node.node_family);
    if (family === "region") return "neutral";

    const explicit = normalizeValue(node.hemisphere || node.hemisphere_scope || node.processing_side || node.brain_side);
    if (["left", "left_brain", "left_hemisphere"].includes(explicit)) return "left";
    if (["right", "right_brain", "right_hemisphere"].includes(explicit)) return "right";
    if (["neutral", "shared", "multi_hemisphere", "cross_hemisphere"].includes(explicit)) return "neutral";

    if (["diagnostic_distortion", "distortion_cluster"].includes(family)) return "right";

    const reservoir = normalizeValue(node.reservoir_id || node.origin?.origin_reservoir);
    if (reservoir === "rrr" || reservoir === "drr" || reservoir.includes("response")) return "right";
    if (reservoir === "rer" || reservoir === "der" || reservoir.includes("ethical")) return "left";

    const domain = normalizeValue(node.domain_display_name || node.domain_name || node.domain_id);
    if (["ethics", "general_ethics", "general ethics"].includes(domain) || domain.includes("ethical")) return "left";
    if (["emotion", "personality", "temperament", "response", "delivery", "rhetoric", "interaction", "experiential", "manipulation"].some((term) => domain.includes(term))) return "right";

    return "neutral";
  }

  function hemisphereLabel(value) {
    if (value === "left") return "Left Hemisphere";
    if (value === "right") return "Right Hemisphere";
    return "Hemisphere-Neutral";
  }

  function inferFilterDomain(node) {
    const family = normalizeValue(node.node_family);
    if (family === "region") return null;
    if (["diagnostic_distortion", "distortion_cluster"].includes(family)) return "Rhetoric and Manipulation";
    if (family === "emotional_cluster") return "Stoic Emotion";

    const rawDomain = node.domain_display_name || node.domain_name || node.domain_id;
    const normalizedDomain = normalizeValue(rawDomain);
    if (["shared_regions", "shared_governance"].includes(normalizedDomain)) return null;
    if (["shared_emotional_governance", "shared_emotional_context"].includes(normalizedDomain)) return "Stoic Emotion";
    if (["ethics", "general_ethics", "general ethics"].includes(normalizedDomain)) return "General Ethics";
    if (rawDomain) return titleCase(rawDomain);

    const hemisphere = inferHemisphere(node);
    if (hemisphere === "right") return "Unclassified Right Hemisphere";
    if (hemisphere === "left") return "Unclassified Left Hemisphere";
    return null;
  }

  function clusterReachClass(node) {
    const explicit = normalizeValue(node.cluster_scope_class || node.cluster_reach_class);
    if (["domain", "multi_domain", "multi_hemisphere"].includes(explicit)) return explicit;

    const hemispheres = Array.isArray(node.represented_hemispheres) ? node.represented_hemispheres.map(normalizeValue).filter(Boolean) : [];
    if (new Set(hemispheres).size > 1 || hemispheres.includes("multi_hemisphere")) return "multi_hemisphere";

    const domains = Array.isArray(node.represented_domains) ? node.represented_domains.map(normalizeValue).filter(Boolean) : [];
    if (new Set(domains).size > 1) return "multi_domain";
    return "domain";
  }

  function clusterReachLabel(value) {
    switch (normalizeValue(value)) {
      case "multi_domain":
        return "Multi-Domain";

      case "multi_hemisphere":
        return "Multi-Hemisphere";

      default:
        return "Domain";
    }
  }

  function clusterColorForNode(
    node,
    side = inferHemisphere(node)
  ) {
    const palette =
      side === "right"
        ? RIGHT_COLORS
        : side === "left"
          ? LEFT_COLORS
          : NEUTRAL_COLORS;

    const reach =
      clusterReachClass(node);

    const paletteKey =
      `cluster_${reach}`;

    return (
      palette[paletteKey] ||
      palette.cluster ||
      palette.default
    );
  }

  function clusterColorForReach(
    side,
    reach
  ) {
    const palette =
      side === "right"
        ? RIGHT_COLORS
        : side === "left"
          ? LEFT_COLORS
          : NEUTRAL_COLORS;

    const normalizedReach =
      normalizeValue(reach);

    return (
      palette[
        `cluster_${normalizedReach}`
      ] ||
      palette.cluster ||
      palette.default
    );
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

    const side =
      inferHemisphere(node);

    const classification =
      classifyArchitecturalObject(node);

    const palette =
      side === "right"
        ? RIGHT_COLORS
        : side === "left"
          ? LEFT_COLORS
          : NEUTRAL_COLORS;

    if (classification === "cluster") {
      return clusterColorForNode(
        node,
        side
      );
    }

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
        DISTORTION_CLUSTER_DETAILS[targetId]
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
        DISTORTION_CLUSTER_DETAILS[targetId]
      ) {
        distortionClusterByNodeId.set(
          sourceId,
          targetId
        );
      } else if (
        DISTORTION_CLUSTER_DETAILS[sourceId]
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
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(message)}</span>
      </div>
    `;
  }

  function availableDomainsForHemisphere(side) {
    if (!canonicalGraphData) {
      return [];
    }

    return Array.from(
      new Set(
        canonicalGraphData.nodes
          .filter(
            (node) =>
              inferHemisphere(node) === side
          )
          .map(inferFilterDomain)
          .filter(Boolean)
      )
    ).sort((a, b) =>
      a.localeCompare(b)
    );
  }

  function colorForFilter(side, filterKey) {
    const palette =
      side === "right"
        ? RIGHT_COLORS
        : side === "left"
          ? LEFT_COLORS
          : NEUTRAL_COLORS;

    return (
      palette[filterKey] ||
      palette.default
    );
  }

  function objectFilterMarkup(
    side,
    filter
  ) {
    const id =
      `graph-${side}-type-${filter.key}`;

    return `
      <label
        class="lab-graph-filter-option"
        for="${escapeHtml(id)}"
      >
        <input
          id="${escapeHtml(id)}"
          type="checkbox"
          data-graph-object-side="${escapeHtml(side)}"
          data-graph-object-type="${escapeHtml(filter.key)}"
          checked
        >

        <span class="lab-graph-filter-option-content">
          <span
            class="lab-graph-filter-dot"
            style="background: ${escapeHtml(
              colorForFilter(
                side,
                filter.key
              )
            )};"
          ></span>

          <span class="lab-graph-filter-label">
            ${escapeHtml(filter.label)}
          </span>
        </span>
      </label>
    `;
  }

  function domainFilterMarkup(
    side,
    domain,
    available
  ) {
    const normalizedDomain =
      domain
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase();

    const id =
      `graph-${side}-domain-${normalizedDomain}`;

    return `
      <label
        class="lab-graph-filter-option${
          available
            ? ""
            : " is-unavailable"
        }"
        for="${escapeHtml(id)}"
      >
        <input
          id="${escapeHtml(id)}"
          type="checkbox"
          data-graph-domain-side="${escapeHtml(side)}"
          data-graph-domain-name="${escapeHtml(domain)}"
          ${
            available
              ? "checked"
              : "disabled"
          }
        >

        <span class="lab-graph-filter-label">
          ${escapeHtml(domain)}

          ${
            available
              ? ""
              : `
                <span class="lab-graph-domain-note">
                  Not in this dataset
                </span>
              `
          }
        </span>
      </label>
    `;
  }

  function sectionMasterMarkup(
    side,
    sectionKey,
    label
  ) {
    const id =
      `graph-${side}-section-${sectionKey}`;

    return `
      <label
        class="lab-graph-filter-option is-section-master"
        for="${escapeHtml(id)}"
      >
        <input
          id="${escapeHtml(id)}"
          type="checkbox"
          data-graph-section-master="${escapeHtml(sectionKey)}"
          data-graph-section-side="${escapeHtml(side)}"
          checked
        >

        <span class="lab-graph-filter-label">
          ${escapeHtml(label)}
        </span>
      </label>
    `;
  }

  function clusterReachFilterMarkup(side, filter) {
    const id = `graph-${side}-cluster-reach-${filter.key}`;
    return `
      <label class="lab-graph-filter-option" for="${escapeHtml(id)}">
        <input id="${escapeHtml(id)}" type="checkbox" data-graph-cluster-side="${escapeHtml(side)}" data-graph-cluster-reach="${escapeHtml(filter.key)}" checked>
        <span class="lab-graph-filter-option-content">
          <span class="lab-graph-filter-dot" style="background: ${escapeHtml(clusterColorForReach(side, filter.key))};"></span>
          <span class="lab-graph-filter-label">${escapeHtml(filter.label)}</span>
        </span>
      </label>
    `;
  }

  function renderObjectColumns(side) {
    const exception =
      ARCHITECTURAL_FILTERS.find(
        (filter) =>
          filter.key === "exception"
      );

    const mitigation =
      ARCHITECTURAL_FILTERS.find(
        (filter) =>
          filter.key === "mitigation"
      );

    const convictions =
      ARCHITECTURAL_FILTERS.filter(
        (filter) =>
          filter.column === "convictions"
      );

    const safeguards =
      ARCHITECTURAL_FILTERS.filter(
        (filter) =>
          filter.column === "safeguards" &&
          !["exception", "mitigation"].includes(
            filter.key
          )
      );

    return `
      <div class="lab-graph-exception-row">
        ${exception
          ? objectFilterMarkup(side, exception)
          : ""}

        ${mitigation
          ? objectFilterMarkup(side, mitigation)
          : ""}
      </div>

      <div class="lab-graph-object-column">
        ${sectionMasterMarkup(
          side,
          "convictions",
          "Convictions"
        )}

        <div class="lab-graph-section-children">
          ${convictions
            .map((filter) =>
              objectFilterMarkup(
                side,
                filter
              )
            )
            .join("")}
        </div>
      </div>

      <div class="lab-graph-object-column">
        ${sectionMasterMarkup(
          side,
          "safeguards",
          "Safeguards"
        )}

        <div class="lab-graph-section-children">
          ${safeguards
            .map((filter) =>
              objectFilterMarkup(
                side,
                filter
              )
            )
            .join("")}
        </div>
      </div>

      <div class="lab-graph-cluster-section">
        ${sectionMasterMarkup(
          side,
          "cluster_reach",
          "Cluster Reach"
        )}

        <div class="lab-graph-section-children lab-graph-cluster-options">
          ${CLUSTER_REACH_FILTERS
            .map((filter) =>
              clusterReachFilterMarkup(
                side,
                filter
              )
            )
            .join("")}
        </div>
      </div>
    `;
  }

  function renderNeutralRegionControl() {
    return `
      <section
        class="lab-graph-neutral-panel"
        aria-label="Governance controls"
      >
        <h3 class="lab-graph-governance-title">
          GOVERNANCE
        </h3>

        <label
          class="lab-graph-filter-option lab-graph-governance-option"
          for="graph-neutral-region"
        >
          <input
            id="graph-neutral-region"
            type="checkbox"
            data-graph-neutral-region
            checked
          >

          <span class="lab-graph-filter-option-content">
            <span
              class="lab-graph-filter-dot"
              style="background: ${escapeHtml(
                NEUTRAL_COLORS.region
              )};"
            ></span>

            <span class="lab-graph-filter-label">
              Stakeholder Region
            </span>
          </span>
        </label>
      </section>
    `;
  }

  function renderHemispherePanel(
    side,
    domains,
    placeholderDomains
  ) {
    const displayName =
      side === "left"
        ? "Left Hemisphere"
        : "Right Hemisphere";

    const futureDomains =
      Array.from(
        new Set(
          placeholderDomains.filter(
            (domain) =>
              !domains.includes(domain)
          )
        )
      );

    return `
      <section
        class="lab-graph-brain-panel"
        data-hemisphere="${escapeHtml(side)}"
      >
        <div class="lab-graph-brain-title-row">
          <h3 class="lab-graph-brain-title">
            ${escapeHtml(displayName)}
          </h3>

          <span class="lab-graph-brain-status">
            ${domains.length}
            available domain${
              domains.length === 1
                ? ""
                : "s"
            }
          </span>
        </div>

        <section class="lab-graph-control-section">
          <h4 class="lab-graph-control-section-title">
            Object Types
          </h4>

          <div class="lab-graph-object-grid">
            ${renderObjectColumns(side)}
          </div>
        </section>

        <section class="lab-graph-control-section">
          <h4 class="lab-graph-control-section-title">
            Domains
          </h4>

          <div class="lab-graph-domain-list">
            <label
              class="lab-graph-filter-option is-master"
              for="graph-${escapeHtml(side)}-all-domains"
            >
              <input
                id="graph-${escapeHtml(side)}-all-domains"
                type="checkbox"
                data-graph-domain-master="${escapeHtml(side)}"
                ${
                  domains.length
                    ? "checked"
                    : ""
                }
              >

              <span class="lab-graph-filter-label">
                All Available ${escapeHtml(displayName)} Domains
              </span>
            </label>

            ${domains
              .map((domain) =>
                domainFilterMarkup(
                  side,
                  domain,
                  true
                )
              )
              .join("")}

            ${futureDomains.length
              ? `
                <details class="lab-graph-future-domains">
                  <summary>
                    Future domains — ${futureDomains.length}
                    not in this dataset
                  </summary>

                  <div class="lab-graph-future-domain-list">
                    ${futureDomains
                      .map((domain) =>
                        domainFilterMarkup(
                          side,
                          domain,
                          false
                        )
                      )
                      .join("")}
                  </div>
                </details>
              `
              : ""}
          </div>
        </section>
      </section>
    `;
  }

  function locateExistingReplayButton() {
    return (
      document.getElementById(
        "replayRunButton"
      ) ||
      document.querySelector(
        "[data-replay-run]"
      )
    );
  }

  function renderControlInterface() {
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

    mriPanel
      .querySelectorAll(
        ".lab-graph-controls, .lab-graph-action-bar, .lab-graph-legend"
      )
      .forEach((element) =>
        element.remove()
      );

    const leftDomains =
      availableDomainsForHemisphere("left");

    const rightDomains =
      availableDomainsForHemisphere("right");

    const controls =
      document.createElement("section");

    controls.className =
      "lab-graph-controls";

    controls.setAttribute(
      "aria-label",
      "Governance MRI graph controls"
    );

    controls.innerHTML =
      renderNeutralRegionControl() +
      renderHemispherePanel(
        "left",
        leftDomains,
        []
      ) +
      renderHemispherePanel(
        "right",
        rightDomains,
        RIGHT_HEMISPHERE_PLACEHOLDER_DOMAINS
      );

    const actionBar =
      document.createElement("div");

    actionBar.className =
      "lab-graph-action-bar";

    actionBar.innerHTML = `
      <div
        id="graphActionMessage"
        class="lab-graph-action-message"
      >
        Adjust the shared structure and hemisphere filters,
        then select <strong>Replay Run</strong>.
      </div>

      <div class="lab-graph-action-controls">
        <label
          id="graphReturnSelectionLabel"
          class="lab-graph-return-selection is-disabled"
          for="graphReturnToSelection"
          title="Select a graph object to enable this option."
        >
          <input
            id="graphReturnToSelection"
            type="checkbox"
            disabled
          >

          <span>
            Return to selected object after replay
          </span>
        </label>

        <button
          id="graphReplayRunButton"
          class="lab-graph-replay-button"
          type="button"
        >
          Replay Run
        </button>
      </div>
    `;

    mriPanel.insertBefore(
      controls,
      graphLayout
    );

    mriPanel.insertBefore(
      actionBar,
      graphLayout
    );

    const originalReplayButton =
      locateExistingReplayButton();

    if (
      originalReplayButton &&
      originalReplayButton.id !==
        "graphReplayRunButton"
    ) {
      originalReplayButton.hidden = true;

      originalReplayButton.setAttribute(
        "aria-hidden",
        "true"
      );
    }

    bindFilterEvents();

    appliedFilterSignature =
      currentFilterSignature();

    updateReturnSelectionControl();
    updatePendingState();
  }

  function objectCheckboxesForSide(side) {
    return Array.from(
      document.querySelectorAll(
        `input[data-graph-object-side="${side}"]`
      )
    );
  }

  function clusterCheckboxesForSide(side) {
    return Array.from(document.querySelectorAll(`input[data-graph-cluster-side="${side}"]`));
  }

  function neutralRegionCheckbox() {
    return document.querySelector("input[data-graph-neutral-region]");
  }

  function domainCheckboxesForSide(side) {
    return Array.from(
      document.querySelectorAll(
        `input[data-graph-domain-side="${side}"]:not(:disabled)`
      )
    );
  }

  function sectionChildren(
    side,
    sectionKey
  ) {
    if (sectionKey === "cluster_reach") {
      return clusterCheckboxesForSide(side);
    }

    const keys =
      sectionKey === "convictions"
        ? [
            "root_conviction",
            "domain_conviction",
            "principle"
          ]
        : [
            "root_safeguard",
            "domain_safeguard",
            "article"
          ];

    return objectCheckboxesForSide(side)
      .filter((checkbox) =>
        keys.includes(
          checkbox.dataset
            .graphObjectType
        )
      );
  }

  function updateSectionMaster(
    side,
    sectionKey
  ) {
    const master =
      document.querySelector(
        `input[data-graph-section-master="${sectionKey}"][data-graph-section-side="${side}"]`
      );

    if (!master) {
      return;
    }

    const children =
      sectionChildren(
        side,
        sectionKey
      );

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

  function updateAllSectionMasters() {
    ["left", "right"].forEach(
      (side) => {
        [
          "convictions",
          "safeguards",
          "cluster_reach"
        ].forEach(
          (sectionKey) =>
            updateSectionMaster(
              side,
              sectionKey
            )
        );
      }
    );
  }

  function updateDomainMaster(side) {
    const master =
      document.querySelector(
        `input[data-graph-domain-master="${side}"]`
      );

    if (!master) {
      return;
    }

    const domains =
      domainCheckboxesForSide(side);

    const checkedCount =
      domains.filter(
        (checkbox) =>
          checkbox.checked
      ).length;

    master.checked =
      domains.length > 0 &&
      checkedCount === domains.length;

    master.indeterminate =
      checkedCount > 0 &&
      checkedCount < domains.length;
  }

  function bindFilterEvents() {
    document
      .querySelectorAll(
        "input[data-graph-section-master]"
      )
      .forEach((master) => {
        master.addEventListener(
          "change",
          () => {
            const side =
              master.dataset
                .graphSectionSide;

            const sectionKey =
              master.dataset
                .graphSectionMaster;

            sectionChildren(
              side,
              sectionKey
            ).forEach((checkbox) => {
              checkbox.checked =
                master.checked;
            });

            master.indeterminate = false;

            updateReturnSelectionControl();
            updatePendingState();
          }
        );
      });

    document
      .querySelectorAll(
        "input[data-graph-domain-master]"
      )
      .forEach((master) => {
        master.addEventListener(
          "change",
          () => {
            const side =
              master.dataset
                .graphDomainMaster;

            domainCheckboxesForSide(
              side
            ).forEach((checkbox) => {
              checkbox.checked =
                master.checked;
            });

            master.indeterminate =
              false;

            updateReturnSelectionControl();
            updatePendingState();
          }
        );
      });

    document
      .querySelectorAll(
        "input[data-graph-domain-side]"
      )
      .forEach((checkbox) => {
        checkbox.addEventListener(
          "change",
          () => {
            updateDomainMaster(
              checkbox.dataset
                .graphDomainSide
            );

            updateReturnSelectionControl();
            updatePendingState();
          }
        );
      });

    document
      .querySelectorAll(
        "input[data-graph-object-side]"
      )
      .forEach((checkbox) => {
        checkbox.addEventListener(
          "change",
          () => {
            const side =
              checkbox.dataset
                .graphObjectSide;

            const objectType =
              checkbox.dataset
                .graphObjectType;

            const sectionKey =
              [
                "root_conviction",
                "domain_conviction",
                "principle"
              ].includes(objectType)
                ? "convictions"
                : [
                    "root_safeguard",
                    "domain_safeguard",
                    "article"
                  ].includes(objectType)
                  ? "safeguards"
                  : null;

            if (sectionKey) {
              updateSectionMaster(
                side,
                sectionKey
              );
            }

            updateReturnSelectionControl();
            updatePendingState();
          }
        );
      });

    document
      .querySelectorAll(
        "input[data-graph-cluster-side], input[data-graph-neutral-region]"
      )
      .forEach((checkbox) => {
        checkbox.addEventListener(
          "change",
          () => {
            if (
              checkbox.matches(
                "input[data-graph-cluster-side]"
              )
            ) {
              updateSectionMaster(
                checkbox.dataset
                  .graphClusterSide,
                "cluster_reach"
              );
            }

            updateReturnSelectionControl();
            updatePendingState();
          }
        );
      });

    updateAllSectionMasters();

    const replayButton =
      document.getElementById(
        "graphReplayRunButton"
      );

    replayButton?.addEventListener(
      "click",
      applySelectedFilters
    );
  }

  function selectedObjectTypesForSide(side) {
    return new Set(
      objectCheckboxesForSide(side)
        .filter(
          (checkbox) =>
            checkbox.checked
        )
        .map(
          (checkbox) =>
            checkbox.dataset
              .graphObjectType
        )
    );
  }

  function selectedClusterReachForSide(side) {
    return new Set(
      clusterCheckboxesForSide(side)
        .filter((checkbox) => checkbox.checked)
        .map((checkbox) => checkbox.dataset.graphClusterReach)
    );
  }

  function selectedDomainsForSide(side) {
    return new Set(
      domainCheckboxesForSide(side)
        .filter(
          (checkbox) =>
            checkbox.checked
        )
        .map(
          (checkbox) =>
            checkbox.dataset
              .graphDomainName
        )
    );
  }

  function currentSelections() {
    return {
      neutral: { regions: Boolean(neutralRegionCheckbox()?.checked) },
      left: {
        domains: selectedDomainsForSide("left"),
        objects: selectedObjectTypesForSide("left"),
        clusterReach: selectedClusterReachForSide("left")
      },
      right: {
        domains: selectedDomainsForSide("right"),
        objects: selectedObjectTypesForSide("right"),
        clusterReach: selectedClusterReachForSide("right")
      }
    };
  }

  function currentFilterSignature() {
    const selections = currentSelections();
    return JSON.stringify({
      neutral: { regions: selections.neutral.regions },
      left: {
        objects: Array.from(selections.left.objects).sort(),
        clusterReach: Array.from(selections.left.clusterReach).sort(),
        domains: Array.from(selections.left.domains).sort()
      },
      right: {
        objects: Array.from(selections.right.objects).sort(),
        clusterReach: Array.from(selections.right.clusterReach).sort(),
        domains: Array.from(selections.right.domains).sort()
      }
    });
  }

  function updatePendingState() {
    const replayButton =
      document.getElementById(
        "graphReplayRunButton"
      );

    const actionMessage =
      document.getElementById(
        "graphActionMessage"
      );

    if (!replayButton) {
      return;
    }

    const hasPendingChanges =
      currentFilterSignature() !==
      appliedFilterSignature;

    replayButton.classList.toggle(
      "is-pending",
      hasPendingChanges
    );

    if (actionMessage) {
      actionMessage.innerHTML =
        hasPendingChanges
          ? `
            Filter selections have changed.
            Select <strong>Replay Run</strong>
            to update the graph.
          `
          : `
            The graph reflects the currently selected
            Left Hemisphere, Right Hemisphere, and shared structure filters.
          `;
    }
  }

  function nodeMatchesFilters(
    node,
    selections
  ) {
    const classification = classifyArchitecturalObject(node);
    if (classification === "region") return selections.neutral.regions;

    const hemisphere = inferHemisphere(node);
    if (!["left", "right"].includes(hemisphere)) return false;

    const domain = inferFilterDomain(node);
    const hemisphereSelections = selections[hemisphere];
    if (!domain || !hemisphereSelections.domains.has(domain)) return false;

    if (classification === "cluster") {
      return hemisphereSelections.clusterReach.has(clusterReachClass(node));
    }
    return hemisphereSelections.objects.has(classification);
  }

  function findCanonicalNode(nodeId) {
    if (
      !canonicalGraphData ||
      !nodeId
    ) {
      return null;
    }

    return (
      canonicalGraphData.nodes.find(
        (node) =>
          node.id === nodeId
      ) ||
      null
    );
  }

  function selectedNodeMatchesPendingFilters() {
    const selectedNode =
      findCanonicalNode(
        selectedNodeId
      );

    if (!selectedNode) {
      return false;
    }

    return nodeMatchesFilters(
      selectedNode,
      currentSelections()
    );
  }

  function updateReturnSelectionControl() {
    const checkbox =
      document.getElementById(
        "graphReturnToSelection"
      );

    const label =
      document.getElementById(
        "graphReturnSelectionLabel"
      );

    if (
      !checkbox ||
      !label
    ) {
      return;
    }

    if (!selectedNodeId) {
      checkbox.checked = false;
      checkbox.disabled = true;

      label.classList.add(
        "is-disabled"
      );

      label.title =
        "Select a graph object to enable this option.";

      return;
    }

    if (
      !selectedNodeMatchesPendingFilters()
    ) {
      checkbox.checked = false;
      checkbox.disabled = true;

      label.classList.add(
        "is-disabled"
      );

      label.title =
        "The selected object is excluded by the pending filters.";

      return;
    }

    checkbox.disabled = false;

    label.classList.remove(
      "is-disabled"
    );

    label.title =
      "After replay, return the camera to the object currently shown in the Object Inspector.";
  }

  function applySelectedFilters() {
    if (
      !canonicalGraphData ||
      !graphInstance
    ) {
      return;
    }

    const selections =
      currentSelections();

    const returnCheckbox =
      document.getElementById(
        "graphReturnToSelection"
      );

    const shouldReturnToSelection =
      Boolean(
        returnCheckbox &&
        returnCheckbox.checked &&
        !returnCheckbox.disabled &&
        selectedNodeId
      );

    const selectedIdBeforeReplay =
      shouldReturnToSelection
        ? selectedNodeId
        : null;

    const visibleNodes =
      canonicalGraphData.nodes
        .filter((node) =>
          nodeMatchesFilters(
            node,
            selections
          )
        )
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
            linkEndpointId(link.source);

          const targetId =
            linkEndpointId(link.target);

          return (
            visibleNodeIds.has(sourceId) &&
            visibleNodeIds.has(targetId)
          );
        })
        .map((link) => ({
          ...link,

          source:
            linkEndpointId(link.source),

          target:
            linkEndpointId(link.target)
        }));

    graphInstance.graphData({
      nodes: visibleNodes,
      links: visibleLinks
    });

    graphInstance.d3ReheatSimulation();

    appliedFilterSignature =
      currentFilterSignature();

    const actionMessage =
      document.getElementById(
        "graphActionMessage"
      );

    if (actionMessage) {
      if (visibleNodes.length === 0) {
        actionMessage.innerHTML = `
          <strong>No matching objects.</strong>
          The current filters exclude every projected node.
        `;
      } else if (visibleLinks.length === 0) {
        actionMessage.innerHTML = `
          <strong>${visibleNodes.length}</strong>
          matching
          ${visibleNodes.length === 1 ? "object is" : "objects are"}
          displayed.
          No visible attachments connect the current selection.
        `;
      } else {
        actionMessage.innerHTML = `
          <strong>${visibleNodes.length}</strong>
          nodes and
          <strong>${visibleLinks.length}</strong>
          links are displayed.
        `;
      }
    }

    const replayButton =
      document.getElementById(
        "graphReplayRunButton"
      );

    replayButton?.classList.remove(
      "is-pending"
    );

    setGraphStatus(
      `Filtered governance graph loaded: ` +
        `${visibleNodes.length} nodes and ` +
        `${visibleLinks.length} links.`,
      "ready"
    );

    /*
     * Establish a safe view after filtering.
     *
     * A one-node graph and a disconnected graph can initially place
     * nodes at or near the origin. A single early zoomToFit call may
     * therefore produce an unusable camera view. Refit after the force
     * simulation has had more time to assign stable coordinates.
     */

    const fitFilteredGraph = () => {
      if (
        !graphInstance ||
        visibleNodes.length === 0
      ) {
        return;
      }

      const renderedGraph =
        graphInstance.graphData();

      const renderedNodes =
        Array.isArray(renderedGraph?.nodes)
          ? renderedGraph.nodes
          : [];

      if (renderedNodes.length === 1) {
        focusNode(
          renderedNodes[0],
          {
            duration: 650,
            distance: 105
          }
        );

        return;
      }

      if (
        typeof graphInstance.zoomToFit ===
          "function"
      ) {
        graphInstance.zoomToFit(
          850,
          45
        );
      }
    };

    window.setTimeout(
      fitFilteredGraph,
      450
    );

    window.setTimeout(
      fitFilteredGraph,
      1250
    );

    /*
     * If requested, wait until the filtered graph has settled,
     * locate the newly rendered node with the same ID, and recreate
     * the visual effect of clicking that node. focusNode() contains
     * a safe fixed-offset fallback for isolated or origin-positioned
     * nodes, so the camera can never occupy the target node itself.
     */

    if (
      shouldReturnToSelection &&
      visibleNodeIds.has(
        selectedIdBeforeReplay
      )
    ) {
      window.setTimeout(() => {
        const renderedGraph =
          graphInstance.graphData();

        const renderedNode =
          renderedGraph.nodes.find(
            (node) =>
              node.id ===
              selectedIdBeforeReplay
          );

        if (!renderedNode) {
          fitFilteredGraph();
          return;
        }

        renderNodeDetails(
          renderedNode
        );

        focusNode(
          renderedNode,
          {
            duration: 900,
            distance: 105
          }
        );
      }, 1850);
    } else {
      /*
       * A final fit is useful for disconnected multi-node selections,
       * whose positions can continue spreading after the earlier fit.
       */
      window.setTimeout(
        fitFilteredGraph,
        2100
      );
    }

    updateReturnSelectionControl();
  }

  function arrayValue(value) {
    return Array.isArray(value)
      ? value
      : [];
  }

  function objectText(record) {
    if (
      !record ||
      typeof record !== "object"
    ) {
      return "";
    }

    const candidates = [
      record.human_readable_text,
      record.belief_text,
      record.intent_text,
      record.description,
      record.text,
      record.statement,
      record.definition,
      record.purpose,
      record.explanation,
      record.summary,
      record.long_description,
      record.rationale
    ];

    const match =
      candidates.find(
        (value) =>
          typeof value === "string" &&
          value.trim()
      );

    return match
      ? match.trim()
      : "";
  }

  function intentKind(intent) {
    const relationship =
      normalizeValue(
        intent.relationship_type
      );

    const id =
      String(
        intent.id ||
        intent.object_id ||
        ""
      ).toUpperCase();

    if (
      relationship.includes("purpose") ||
      id.includes("-IP-")
    ) {
      return "purpose";
    }

    if (
      relationship.includes("explanatory") ||
      relationship.includes("explain") ||
      id.includes("-IE-")
    ) {
      return "explanatory";
    }

    return "other";
  }

  function renderInspectorSection(
    title,
    count,
    body
  ) {
    return `
      <section class="lab-graph-inspector-section">
        <h4 class="lab-graph-inspector-section-title">
          <span>${escapeHtml(title)}</span>
          <span class="lab-graph-inspector-section-count">
            ${escapeHtml(count)}
          </span>
        </h4>

        ${body}
      </section>
    `;
  }

  function renderIntentCards(intents) {
    if (!intents.length) {
      return `
        <p class="lab-graph-inspector-empty">
          No related Intents were recorded.
        </p>
      `;
    }

    return `
      <div class="lab-graph-intent-list">
        ${intents
          .map((intent) => {
            const kind =
              intentKind(intent);

            const kindLabel =
              kind === "purpose"
                ? "Purpose"
                : kind === "explanatory"
                  ? "Explanatory"
                  : "Intent";

            const textValue =
              objectText(intent);

            return `
              <article
                class="lab-graph-intent-card"
                data-intent-kind="${escapeHtml(kind)}"
              >
                <div class="lab-graph-intent-card-header">
                  <h5 class="lab-graph-intent-card-title">
                    ${escapeHtml(
                      intent.name ||
                      intent.title ||
                      intent.id ||
                      intent.object_id ||
                      "Related Intent"
                    )}
                  </h5>

                  <span class="lab-graph-intent-card-type">
                    ${escapeHtml(kindLabel)}
                  </span>
                </div>

                <div class="lab-graph-intent-card-id">
                  ${escapeHtml(
                    intent.id ||
                    intent.object_id ||
                    "ID not recorded"
                  )}
                </div>

                ${
                  textValue
                    ? `
                      <p class="lab-graph-intent-card-text">
                        ${escapeHtml(textValue)}
                      </p>
                    `
                    : `
                      <p class="lab-graph-inspector-empty">
                        Intent text was not recorded.
                      </p>
                    `
                }

                <div class="lab-graph-intent-card-meta">
                  <span>
                    <strong>Relationship:</strong>
                    ${escapeHtml(
                      displayValue(
                        intent.relationship_type
                      )
                    )}
                  </span>

                  <span>
                    <strong>Attachment:</strong>
                    ${escapeHtml(
                      displayValue(
                        intent.attachment_id
                      )
                    )}
                  </span>
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderRelatedCards(
    records,
    family
  ) {
    if (!records.length) {
      return `
        <p class="lab-graph-inspector-empty">
          None recorded.
        </p>
      `;
    }

    return `
      <div class="lab-graph-related-list">
        ${records
          .map((record) => `
            <article
              class="lab-graph-related-card"
              data-related-family="${escapeHtml(family)}"
            >
              <h5 class="lab-graph-related-card-title">
                ${escapeHtml(
                  record.name ||
                  record.title ||
                  record.id ||
                  record.object_id ||
                  "Related object"
                )}
              </h5>

              <div class="lab-graph-related-card-id">
                ${escapeHtml(
                  record.id ||
                  record.object_id ||
                  "ID not recorded"
                )}
              </div>

              <div class="lab-graph-related-card-meta">
                <span>
                  Relationship:
                  ${escapeHtml(
                    displayValue(
                      record.relationship_type
                    )
                  )}
                </span>

                <span>
                  Attachment:
                  ${escapeHtml(
                    displayValue(
                      record.attachment_id
                    )
                  )}
                </span>
              </div>
            </article>
          `)
          .join("")}
      </div>
    `;
  }

  function renderAppliedClusterScopeCards(scopes) {
    if (!scopes.length) {
      return `
        <p class="lab-graph-inspector-empty">
          No Cluster Scopes apply through the linked Clusters.
        </p>
      `;
    }

    return `
      <div class="lab-graph-related-list">
        ${scopes
          .map((scope) => {
            const textValue =
              scope.scope_definition ||
              objectText(scope);

            return `
              <article
                class="lab-graph-related-card"
                data-related-family="applied_cluster_scope"
              >
                <h5 class="lab-graph-related-card-title">
                  ${escapeHtml(
                    scope.name ||
                    scope.title ||
                    scope.id ||
                    scope.object_id ||
                    "Applied Cluster Scope"
                  )}
                </h5>

                <div class="lab-graph-related-card-id">
                  ${escapeHtml(
                    scope.id ||
                    scope.object_id ||
                    "ID not recorded"
                  )}
                </div>

                ${
                  textValue
                    ? `
                      <p class="lab-graph-intent-card-text">
                        ${escapeHtml(textValue)}
                      </p>
                    `
                    : `
                      <p class="lab-graph-inspector-empty">
                        Cluster Scope text was not recorded.
                      </p>
                    `
                }

                <div class="lab-graph-related-card-meta">
                  <span>
                    <strong>Applied through Cluster:</strong>
                    ${escapeHtml(
                      displayValue(
                        scope.applied_through_cluster_name
                      )
                    )}
                  </span>

                  <span>
                    <strong>Cluster ID:</strong>
                    ${escapeHtml(
                      displayValue(
                        scope.applied_through_cluster_id
                      )
                    )}
                  </span>

                  <span>
                    <strong>Applies to:</strong>
                    ${escapeHtml(
                      displayValue(
                        scope.applies_to_belief_family ||
                        scope.scope_type
                      )
                    )}
                  </span>

                  <span>
                    <strong>Scope attachment:</strong>
                    ${escapeHtml(
                      displayValue(
                        scope.cluster_scope_attachment_id
                      )
                    )}
                  </span>

                  <span>
                    <strong>Belief-to-Cluster attachment:</strong>
                    ${escapeHtml(
                      displayValue(
                        scope.belief_cluster_attachment_id
                      )
                    )}
                  </span>
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function isClusterNode(node) {
    return [
      "cluster",
      "distortion_cluster",
      "emotional_cluster"
    ].includes(
      normalizeValue(node.node_family)
    );
  }

  function isBeliefScopeConsumer(node) {
    return [
      "conviction",
      "principle",
      "safeguard",
      "article",
      "exception",
      "mitigation"
    ].includes(
      normalizeValue(
        node.object_type ||
        node.node_family
      ).replace(/s$/, "")
    );
  }

  function renderBreakdownRows(values) {
    if (
      !values ||
      typeof values !== "object" ||
      Array.isArray(values) ||
      !Object.keys(values).length
    ) {
      return `
        <p class="lab-graph-inspector-empty">
          No breakdown recorded.
        </p>
      `;
    }

    return `
      <div class="lab-graph-attachment-breakdown-list">
        ${Object.entries(values)
          .sort(([a], [b]) =>
            a.localeCompare(b)
          )
          .map(([label, value]) => `
            <div class="lab-graph-attachment-breakdown-row">
              <span class="lab-graph-attachment-breakdown-label">
                ${escapeHtml(titleCase(label))}
              </span>

              <span class="lab-graph-attachment-breakdown-value">
                ${escapeHtml(displayValue(value))}
              </span>
            </div>
          `)
          .join("")}
      </div>
    `;
  }

  function visibleLinkCountForNode(nodeId) {
    if (
      !graphInstance ||
      !nodeId
    ) {
      return 0;
    }

    const data =
      graphInstance.graphData();

    return data.links.filter((link) => {
      const sourceId =
        linkEndpointId(link.source);

      const targetId =
        linkEndpointId(link.target);

      return (
        sourceId === nodeId ||
        targetId === nodeId
      );
    }).length;
  }

  function projectedLinkCountForNode(nodeId) {
    if (
      !canonicalGraphData ||
      !nodeId
    ) {
      return 0;
    }

    return canonicalGraphData.links.filter(
      (link) => {
        const sourceId =
          linkEndpointId(link.source);

        const targetId =
          linkEndpointId(link.target);

        return (
          sourceId === nodeId ||
          targetId === nodeId
        );
      }
    ).length;
  }

  function renderAttachmentDetails(node) {
    const summary =
      node.attachment_summary &&
      typeof node.attachment_summary === "object"
        ? node.attachment_summary
        : {};

    const details =
      arrayValue(
        node.attachment_details
      );

    const attachmentObjects =
      summary.attachment_object_count ??
      node.attachment_count ??
      0;

    const compiledDirections =
      summary.compiled_direction_count ??
      details.length;

    const projectedLinks =
      projectedLinkCountForNode(
        node.id
      );

    const visibleLinks =
      visibleLinkCountForNode(
        node.id
      );

    const familyCounts =
      summary.by_endpoint_family_attachment_object_count ||
      summary.by_endpoint_family_direction_count ||
      {};

    const roleCounts =
      summary.by_runtime_role_attachment_object_count ||
      summary.by_runtime_role_direction_count ||
      {};

    const typeCounts =
      summary.by_attachment_type_attachment_object_count ||
      summary.by_attachment_type_direction_count ||
      {};

    return `
      <div class="lab-graph-attachment-summary">
        <div class="lab-graph-attachment-stat">
          <span class="lab-graph-attachment-stat-label">
            Attachment objects
          </span>
          <span class="lab-graph-attachment-stat-value">
            ${escapeHtml(attachmentObjects)}
          </span>
        </div>

        <div class="lab-graph-attachment-stat">
          <span class="lab-graph-attachment-stat-label">
            Compiled directions
          </span>
          <span class="lab-graph-attachment-stat-value">
            ${escapeHtml(compiledDirections)}
          </span>
        </div>

        <div class="lab-graph-attachment-stat">
          <span class="lab-graph-attachment-stat-label">
            Projected graph links
          </span>
          <span class="lab-graph-attachment-stat-value">
            ${escapeHtml(projectedLinks)}
          </span>
        </div>

        <div class="lab-graph-attachment-stat">
          <span class="lab-graph-attachment-stat-label">
            Visible graph links
          </span>
          <span class="lab-graph-attachment-stat-value">
            ${escapeHtml(visibleLinks)}
          </span>
        </div>
      </div>

      <div class="lab-graph-attachment-group">
        <h5 class="lab-graph-attachment-group-title">
          Related endpoint families
        </h5>
        ${renderBreakdownRows(familyCounts)}
      </div>

      <div class="lab-graph-attachment-group">
        <h5 class="lab-graph-attachment-group-title">
          Runtime roles
        </h5>
        ${renderBreakdownRows(roleCounts)}
      </div>

      <div class="lab-graph-attachment-group">
        <h5 class="lab-graph-attachment-group-title">
          Attachment types
        </h5>
        ${renderBreakdownRows(typeCounts)}
      </div>

      ${
        details.length
          ? `
            <div class="lab-graph-attachment-detail-list">
              ${details
                .map((detail) => `
                  <article class="lab-graph-attachment-detail">
                    <div class="lab-graph-attachment-detail-header">
                      <span class="lab-graph-attachment-detail-id">
                        ${escapeHtml(
                          detail.attachment_id ||
                          "Attachment ID not recorded"
                        )}
                      </span>

                      <span class="lab-graph-attachment-detail-direction">
                        ${escapeHtml(
                          detail.direction ||
                          "direction unknown"
                        )}
                      </span>
                    </div>

                    <div class="lab-graph-attachment-detail-body">
                      <span>
                        <strong>Related object:</strong>
                        ${escapeHtml(
                          displayValue(
                            detail.related_object_id
                          )
                        )}
                      </span>

                      <span>
                        <strong>Family:</strong>
                        ${escapeHtml(
                          displayValue(
                            detail.related_object_family
                          )
                        )}
                      </span>

                      <span>
                        <strong>Relationship:</strong>
                        ${escapeHtml(
                          displayValue(
                            detail.relationship_type
                          )
                        )}
                      </span>

                      <span>
                        <strong>Runtime role:</strong>
                        ${escapeHtml(
                          displayValue(
                            detail.runtime_role
                          )
                        )}
                      </span>
                    </div>
                  </article>
                `)
                .join("")}
            </div>
          `
          : ""
      }
    `;
  }

  function renderMoreDetails(node) {
    const intents =
      arrayValue(
        node.resolved_intents
      );

    const purposeIntents =
      intents.filter(
        (intent) =>
          intentKind(intent) === "purpose"
      );

    const explanatoryIntents =
      intents.filter(
        (intent) =>
          intentKind(intent) === "explanatory"
      );

    const otherIntents =
      intents.filter(
        (intent) =>
          !["purpose", "explanatory"].includes(
            intentKind(intent)
          )
      );

    const clusters =
      arrayValue(
        node.resolved_clusters
      );

    const regions =
      arrayValue(
        node.resolved_regions
      );

    const beliefs =
      arrayValue(
        node.resolved_beliefs
      );

    const scopes =
      arrayValue(
        node.resolved_cluster_scopes
      );

    const appliedClusterScopes =
      arrayValue(
        node.applied_cluster_scopes
      );

    const distortions =
      arrayValue(
        node.resolved_diagnostic_distortions
      );

    return `
      <details class="lab-graph-more-details">
        <summary>More Details</summary>

        <div class="lab-graph-more-details-content">
          ${renderInspectorSection(
            "Purpose Intents",
            purposeIntents.length,
            renderIntentCards(
              purposeIntents
            )
          )}

          ${renderInspectorSection(
            "Explanatory Intents",
            explanatoryIntents.length,
            renderIntentCards(
              explanatoryIntents
            )
          )}

          ${
            otherIntents.length
              ? renderInspectorSection(
                  "Other Intents",
                  otherIntents.length,
                  renderIntentCards(
                    otherIntents
                  )
                )
              : ""
          }

          ${renderInspectorSection(
            "Clusters",
            clusters.length,
            renderRelatedCards(
              clusters,
              "cluster"
            )
          )}

          ${renderInspectorSection(
            "Regions",
            regions.length,
            renderRelatedCards(
              regions,
              "region"
            )
          )}

          ${renderInspectorSection(
            "Related Beliefs",
            beliefs.length,
            renderRelatedCards(
              beliefs,
              "belief"
            )
          )}

          ${
            isClusterNode(node)
              ? renderInspectorSection(
                  "Cluster Scopes",
                  scopes.length,
                  renderRelatedCards(
                    scopes,
                    "cluster_scope"
                  )
                )
              : ""
          }

          ${
            isBeliefScopeConsumer(node)
              ? renderInspectorSection(
                  "Cluster Scopes Applied",
                  appliedClusterScopes.length,
                  renderAppliedClusterScopeCards(
                    appliedClusterScopes
                  )
                )
              : ""
          }

          ${renderInspectorSection(
            "Diagnostic Distortions",
            distortions.length,
            renderRelatedCards(
              distortions,
              "diagnostic_distortion"
            )
          )}

          ${renderInspectorSection(
            "Attachment Breakdown",
            node.attachment_summary
              ?.attachment_object_count ??
              node.attachment_count ??
              0,
            renderAttachmentDetails(node)
          )}
        </div>
      </details>
    `;
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
      updateReturnSelectionControl();
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

    const hemisphere =
      inferHemisphere(node);

    const classification =
      classifyArchitecturalObject(node);

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
          <dt>Hemisphere</dt>
          <dd>
            ${escapeHtml(
              hemisphereLabel(hemisphere)
            )}
          </dd>
        </div>

        <div>
          <dt>Filter Domain</dt>
          <dd>
            ${escapeHtml(filterDomain)}
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
          classification === "cluster"
            ? `
              <div>
                <dt>Cluster reach</dt>
                <dd>${escapeHtml(titleCase(clusterReachClass(node)))}</dd>
              </div>
            `
            : ""
        }

        ${
          parentDistortionClusterId
            ? `
              <div>
                <dt>Distortion Cluster</dt>
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
          <dt>Energizing threshold</dt>
          <dd>
            ${escapeHtml(
              displayValue(
                node.energizing_threshold
              )
            )}
          </dd>
        </div>

        <div>
          <dt>Compiled attachments</dt>
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
          <dt>Origin reservoir</dt>
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
        objectText(node)
          ? `
            <section class="lab-graph-detail-text">
              <h4 class="lab-graph-detail-text-title">
                Object Text
              </h4>

              <p class="lab-graph-detail-text-body">
                ${escapeHtml(
                  objectText(node)
                )}
              </p>
            </section>
          `
          : ""
      }

      ${renderMoreDetails(node)}

      ${
        node.governance_role
          ? `
            <details class="lab-graph-detail-raw">
              <summary>Governance role</summary>
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
            <details class="lab-graph-detail-raw">
              <summary>MRI behavior</summary>
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

    updateReturnSelectionControl();
  }

  function focusNode(
    node,
    options = {}
  ) {
    if (
      !graphInstance ||
      !node
    ) {
      return false;
    }

    const numericCoordinate = (
      value
    ) => {
      const number =
        Number(value);

      return Number.isFinite(number)
        ? number
        : 0;
    };

    const x =
      numericCoordinate(node.x);

    const y =
      numericCoordinate(node.y);

    const z =
      numericCoordinate(node.z);

    const target = {
      x,
      y,
      z
    };

    const requestedDistance =
      Number(options.distance);

    const cameraDistance =
      Number.isFinite(
        requestedDistance
      ) &&
      requestedDistance > 0
        ? requestedDistance
        : 90;

    const requestedDuration =
      Number(options.duration);

    const duration =
      Number.isFinite(
        requestedDuration
      ) &&
      requestedDuration >= 0
        ? requestedDuration
        : 900;

    const radialDistance =
      Math.hypot(x, y, z);

    let camera;

    if (
      !Number.isFinite(
        radialDistance
      ) ||
      radialDistance < 1
    ) {
      /*
       * An isolated or newly created node often sits at the origin.
       * Never place the camera at the same position as its target.
       */
      camera = {
        x: x + cameraDistance * 0.35,
        y: y + cameraDistance * 0.2,
        z: z + cameraDistance
      };
    } else {
      const ratio =
        1 +
        cameraDistance /
          radialDistance;

      camera = {
        x: x * ratio,
        y: y * ratio,
        z: z * ratio
      };

      const separation =
        Math.hypot(
          camera.x - x,
          camera.y - y,
          camera.z - z
        );

      if (
        !Number.isFinite(
          separation
        ) ||
        separation < 1
      ) {
        camera = {
          x: x + cameraDistance * 0.35,
          y: y + cameraDistance * 0.2,
          z: z + cameraDistance
        };
      }
    }

    graphInstance.cameraPosition(
      camera,
      target,
      duration
    );

    return true;
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
      payload.links.find((link) => {
        const sourceId =
          linkEndpointId(link.source);

        const targetId =
          linkEndpointId(link.target);

        return (
          !nodeIds.has(sourceId) ||
          !nodeIds.has(targetId)
        );
      });

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
      cloneGraphData(payload);

    container.innerHTML = "";

    graphInstance =
      window
        .ForceGraph3D()(container)
        .backgroundColor("#07111d")
        .showNavInfo(false)
        .graphData(
          cloneGraphData(
            canonicalGraphData
          )
        )
        .nodeId("id")
        .nodeLabel((node) => {
          const name =
            node.name ||
            node.label ||
            node.id;

          return `
            ${escapeHtml(name)}
            <br>
            <small>
              ${escapeHtml(
                titleCase(
                  hemisphereLabel(
                    inferHemisphere(node)
                  )
                )
              )}
              ·
              ${escapeHtml(
                classifyArchitecturalObject(
                  node
                ) === "cluster"
                  ? `Cluster (${clusterReachLabel(
                      clusterReachClass(
                        node
                      )
                    )})`
                  : titleCase(
                      classifyArchitecturalObject(
                        node
                      )
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
    renderControlInterface();

    if (resizeObserver) {
      resizeObserver.disconnect();
    }

    resizeObserver =
      new ResizeObserver(
        updateGraphSize
      );

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
      document.getElementById(
        "governanceGraph"
      );

    if (!container) {
      return;
    }

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
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      startWhenReady
    );
  } else {
    startWhenReady();
  }
})();
