// Netlify Function: POST /api/verdict  →  /.netlify/functions/verdict
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

let ACCORD = null;
function loadAccord() {
  if (ACCORD) return ACCORD;
  const base = path.join(__dirname, "..", "accord");
  const readYaml = (f) => yaml.load(fs.readFileSync(path.join(base, f), "utf8"));
  const convictions = readYaml("convictions.yaml");
  const safeguards  = readYaml("safeguards.yaml");
  const principles  = readYaml("principles.yaml");
  ACCORD = { convictions, safeguards, principles, version: Date.now() };
  return ACCORD;
}

// demo heuristics — swap with your production detectors
function ethicsHeuristics(text) {
  const t = (text || "").toLowerCase();
  const triggers = [];
  const push = (type, code) => triggers.push({ type, code });

  if (/without consent|secretly|coerce|trick|deceive/.test(t)) push("conviction", "C2_consent");
  if (/humiliate|demean|shame|harass/.test(t)) push("conviction", "C1_dignity");
  if (/\bhurt|injure|dangerous|unsafe|harm\b/.test(t)) push("safeguard", "S1_harm_prevention");
  if (/manipulate|gaslight|trick|guilt/.test(t)) push("safeguard", "S3_manipulation");
  if (/unfair|bump someone|skip the line|discriminate/.test(t)) push("principle", "P2_equity_over_efficiency");
  if (/favor|prefer .* because.*demographic|race|gender/.test(t)) push("principle", "P1_objectivity");

  let risk = 0;
  triggers.forEach(tr => {
    if (tr.type === "safeguard")  risk += 0.25;
    if (tr.type === "conviction") risk += 0.20;
    if (tr.type === "principle")  risk += 0.10;
  });
  return { triggers, risk: Math.min(1, risk) };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }
    const { dilemma } = JSON.parse(event.body || "{}");
    if (!dilemma || dilemma.length < 10) {
      return { statusCode: 400, body: JSON.stringify({ error: "Please provide a dilemma (≥ 10 chars)." }) };
    }

    const accord = loadAccord();
    const { triggers, risk } = ethicsHeuristics(dilemma);

    // map triggers to human-readable text from YAML
    const explain = triggers.map(tr => {
      let text;
      if (tr.type === "conviction") text = accord.convictions?.convictions?.[tr.code]?.text;
      if (tr.type === "safeguard")  text = accord.safeguards?.safeguards?.[tr.code]?.text;
      if (tr.type === "principle")  text = accord.principles?.principles?.[tr.code]?.text;
      return { ...tr, text: text || "" };
    });

    // route decision
    let route = "ALLOW", urgency = "low";
    if (risk >= 0.70) { route = "ESCALATE"; urgency = "high"; }
    else if (risk >= 0.50) { route = "CLARIFY"; urgency = "medium"; }
    else if (risk >= 0.25) { route = "ALLOW_WITH_CAUTIONS"; }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        composite: { risk: Number(risk.toFixed(2)), urgency },
        route,
        triggers: explain,
        message:
          route === "ALLOW" ? "Approved: No material conflicts." :
          route === "ALLOW_WITH_CAUTIONS" ? "Allowed with cautions." :
          route === "CLARIFY" ? "Clarification required." :
          "Escalation required."
      }, null, 2)
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: "Internal Server Error" }) };
  }
};
