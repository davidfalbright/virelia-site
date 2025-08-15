// Netlify Function: POST /api/verdict  →  /.netlify/functions/verdict
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

function json(statusCode, bodyObj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST,OPTIONS"
    },
    body: JSON.stringify(bodyObj || {}, null, 2)
  };
}

function safeLoadYaml(filePath) {
  try { return yaml.load(fs.readFileSync(filePath, "utf8")); }
  catch (e) { throw new Error(`Failed to load ${filePath}: ${e.message}`); }
}

// NOTE: we will keep YAMLs in /netlify/accord so paths are stable in functions.
let ACCORD = null;
function loadAccord() {
  if (ACCORD) return ACCORD;
  const base = path.join(__dirname, "..", "accord");
  const convictions = safeLoadYaml(path.join(base, "convictions.yaml"));
  const safeguards  = safeLoadYaml(path.join(base, "safeguards.yaml"));
  const principles  = safeLoadYaml(path.join(base, "principles.yaml"));
  ACCORD = { convictions, safeguards, principles, version: Date.now() };
  return ACCORD;
}

function ethicsHeuristics(text) {
  const t = (text || "").toLowerCase();
  const triggers = [];
  const push = (type, code) => triggers.push({ type, code });

  if (/without consent|secretly|coerce|trick|deceive/.test(t)) push("conviction", "C2_consent");
  if (/humiliate|demean|shame|harass/.test(t))                push("conviction", "C1_dignity");
  if (/\bhurt|injure|dangerous|unsafe|harm\b/.test(t))        push("safeguard", "S1_harm_prevention");
  if (/manipulate|gaslight|trick|guilt/.test(t))              push("safeguard", "S3_manipulation");
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
    if (event.httpMethod === "OPTIONS") return json(204, {});
    if (event.httpMethod !== "POST")    return json(405, { error: "Method Not Allowed" });

    let payload = {};
    try { payload = JSON.parse(event.body || "{}"); }
    catch { return json(400, { error: "Invalid JSON body" }); }

    const dilemma = (payload.dilemma || "").trim();
    if (dilemma.length < 10) return json(400, { error: "Please provide a dilemma (≥ 10 chars)." });

    const accord = loadAccord();
    const { triggers, risk } = ethicsHeuristics(dilemma);

    const explained = triggers.map(tr => {
      let text;
      if (tr.type === "conviction") text = accord.convictions?.convictions?.[tr.code]?.text;
      if (tr.type === "safeguard")  text = accord.safeguards?.safeguards?.[tr.code]?.text;
      if (tr.type === "principle")  text = accord.principles?.principles?.[tr.code]?.text;
      return { ...tr, text: text || "" };
    });

    let route = "ALLOW", urgency = "low";
    if (risk >= 0.70) { route = "ESCALATE"; urgency = "high"; }
    else if (risk >= 0.50) { route = "CLARIFY"; urgency = "medium"; }
    else if (risk >= 0.25) { route = "ALLOW_WITH_CAUTIONS"; }

    return json(200, {
      timestamp: new Date().toISOString(),
      composite: { risk: Number(risk.toFixed(2)), urgency },
      route,
      triggers: explained,
      message:
        route === "ALLOW" ? "Approved: No material conflicts." :
        route === "ALLOW_WITH_CAUTIONS" ? "Allowed with cautions." :
        route === "CLARIFY" ? "Clarification required." :
        "Escalation required."
    });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
