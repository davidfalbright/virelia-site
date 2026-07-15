// lab/lab-graph.js
// Read-only Virelia Governance MRI structural graph.
// Loads a Projection Engine artifact prepared for 3d-force-graph.

(function () {
  "use strict";

  const GRAPH_DATA_URL =
    "lab/data/Virelia_Consulting_view_cache_3d_force_graph_TEST_DATA.json";

  const RIGHT_BRAIN_PLACEHOLDER_DOMAINS = Object.freeze([
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

    region: "#f2c65b",
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

    region: "#ff9d3d",
    cluster: "#8d6cff",

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
    {
      key: "root_conviction",
      label: "Root Conviction",
      column: "convictions"
    },
    {
      key: "domain_conviction",
      label: "Domain Conviction",
      column: "convictions"
    },
    {
      key: "principle",
      label: "Principle",
      column: "convictions"
    },
    {
      key: "root_safeguard",
      label: "Root Safeguard",
      column: "safeguards"
    },
    {
      key: "domain_safeguard",
      label: "Domain Safeguard",
      column: "safeguards"
    },
    {
      key: "article",
      label: "Article",
      column: "safeguards"
    },
    {
      key: "region",
      label: "Region",
      column: "structure"
    },
    {
      key: "cluster",
      label: "Cluster",
      column: "structure"
    }
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

    /*
     * Individual diagnostic distortions currently remain controlled
     * through the Cluster filter because they are diagnostic members
     * of the selected Distortion Cluster.
     */

    if (
      family === "diagnostic_distortion"
    ) {
      return "cluster";
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
        node.reservoir_id ||
        node.origin?.origin_reservoir
      );

    if (
      reservoir === "rrr" ||
      reservoir === "drr" ||
      reservoir.includes("response")
    ) {
      return "right";
    }

    if (
      reservoir === "rer" ||
      reservoir === "der" ||
      reservoir.includes("ethical")
    ) {
      return "left";
    }

    const domain =
      normalizeValue(
        node.domain_name ||
        node.domain_id
      );

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

    const domain =
      node.domain_display_name ||
      node.domain_name ||
      node.domain_id;

    if (domain) {
      return titleCase(domain);
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

    const side =
      inferBrainSide(node);

    const classification =
      classifyArchitecturalObject(node);

    const palette =
      side === "right"
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

  function availableDomainsForSide(side) {
    if (!canonicalGraphData) {
      return [];
    }

    return Array.from(
      new Set(
        canonicalGraphData.nodes
          .filter(
            (node) =>
              inferBrainSide(node) === side
          )
          .map(inferFilterDomain)
      )
    ).sort((a, b) =>
      a.localeCompare(b)
    );
  }

  function colorForFilter(side, filterKey) {
    const palette =
      side === "right"
        ? RIGHT_COLORS
        : LEFT_COLORS;

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

  function renderObjectColumns(side) {
    const columns = [
      {
        key: "convictions",
        title: "Convictions"
      },
      {
        key: "safeguards",
        title: "Safeguards"
      },
      {
        key: "structure",
        title: "Structure"
      }
    ];

    return columns
      .map((column) => {
        const items =
          ARCHITECTURAL_FILTERS.filter(
            (filter) =>
              filter.column === column.key
          );

        return `
          <div class="lab-graph-object-column">
            <div class="lab-graph-object-column-title">
              ${escapeHtml(column.title)}
            </div>

            ${items
              .map((filter) =>
                objectFilterMarkup(
                  side,
                  filter
                )
              )
              .join("")}
          </div>
        `;
      })
      .join("");
  }

  function renderBrainPanel(
    side,
    domains,
    placeholderDomains
  ) {
    const displayName =
      side === "left"
        ? "Left Brain"
        : "Right Brain";

    const allDomains =
      Array.from(
        new Set([
          ...domains,
          ...placeholderDomains
        ])
      );

    return `
      <section
        class="lab-graph-brain-panel"
        data-brain-side="${escapeHtml(side)}"
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

            ${allDomains
              .map((domain) =>
                domainFilterMarkup(
                  side,
                  domain,
                  domains.includes(domain)
                )
              )
              .join("")}
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
      availableDomainsForSide("left");

    const rightDomains =
      availableDomainsForSide("right");

    const controls =
      document.createElement("section");

    controls.className =
      "lab-graph-controls";

    controls.setAttribute(
      "aria-label",
      "Governance MRI graph controls"
    );

    controls.innerHTML =
      renderBrainPanel(
        "left",
        leftDomains,
        []
      ) +
      renderBrainPanel(
        "right",
        rightDomains,
        RIGHT_BRAIN_PLACEHOLDER_DOMAINS
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
        Adjust the Left Brain and Right Brain filters,
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

  function domainCheckboxesForSide(side) {
    return Array.from(
      document.querySelectorAll(
        `input[data-graph-domain-side="${side}"]:not(:disabled)`
      )
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
            updateReturnSelectionControl();
            updatePendingState();
          }
        );
      });

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
      left: {
        domains:
          selectedDomainsForSide("left"),

        objects:
          selectedObjectTypesForSide(
            "left"
          )
      },

      right: {
        domains:
          selectedDomainsForSide("right"),

        objects:
          selectedObjectTypesForSide(
            "right"
          )
      }
    };
  }

  function currentFilterSignature() {
    const selections =
      currentSelections();

    return JSON.stringify({
      left: {
        objects: Array.from(
          selections.left.objects
        ).sort(),

        domains: Array.from(
          selections.left.domains
        ).sort()
      },

      right: {
        objects: Array.from(
          selections.right.objects
        ).sort(),

        domains: Array.from(
          selections.right.domains
        ).sort()
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
            Left Brain and Right Brain filters.
          `;
    }
  }

  function nodeMatchesFilters(
    node,
    selections
  ) {
    const side =
      inferBrainSide(node);

    const domain =
      inferFilterDomain(node);

    const objectType =
      classifyArchitecturalObject(node);

    const sideSelections =
      selections[side];

    return (
      sideSelections.domains.has(domain) &&
      sideSelections.objects.has(objectType)
    );
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
      actionMessage.innerHTML = `
        <strong>${visibleNodes.length}</strong>
        nodes and
        <strong>${visibleLinks.length}</strong>
        links are displayed.
      `;
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
     * First establish the full filtered topology in view.
     */

    window.setTimeout(() => {
      if (
        visibleNodes.length > 0 &&
        typeof graphInstance.zoomToFit ===
          "function"
      ) {
        graphInstance.zoomToFit(
          850,
          45
        );
      }
    }, 450);

    /*
     * If requested, wait until the filtered graph has had time
     * to settle, locate the newly rendered node with the same ID,
     * and recreate the visual effect of clicking that node.
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
          return;
        }

        renderNodeDetails(
          renderedNode
        );

        focusNode(
          renderedNode
        );
      }, 1450);
    }

    updateReturnSelectionControl();
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

    const brainSide =
      inferBrainSide(node);

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
        Math.max(distance, 1);

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
                  inferBrainSide(node)
                )
              )}
              ·
              ${escapeHtml(
                titleCase(
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
