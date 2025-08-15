// LLM-powered Bronze Accord verdict (Netlify Function)
// POST /api/verdict  →  /.netlify/functions/verdict
// Env required: OPENAI_API_KEY
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

function json(status, body) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",        // lock to your domain in prod
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST,OPTIONS"
    },
    body: JSON.stringify(body || {}, null, 2)
  };
}

function safeLoadYaml(p) {
  return yaml.load(fs.readFileSync(p, "utf8"));
}

// Load reservoirs (bundled via netlify.toml included_files)
let ACCORD = null;
function loadAccord() {
  if (ACCORD) return ACCORD;
  const base = path.join(__dirname, "..", "accord");
  const convictions = safeLoadYaml(path.join(base, "convictions.yaml"));
  const safeguards  = safeLoadYaml(path.join(base, "safeguards.yaml"));
  const principles  = safeLoadYaml(path.join(base, "principles.yaml"));
  ACCORD = { convictions, safeguards, principles };
  return ACCORD;
}

// Minimal local heuristic fallback (used if LLM fails)
function heuristicFallback(dilemma) {
  const t = (dilemma || "").toLowerCase();
  const triggers = [];
  const push = (type, code, text) => triggers.push({type, code, text});
  if (/\bsteal|rob|mug|take .* money|extort/.test(t)) push("safeguard","S1_harm_prevention","Avoid actions likely to cause physical or severe psychological harm.");
  if (/coerce|threat|force|without consent/.test(t)) push("conviction","C2_consent","Honor informed consent and avoid coercion.");
  if (/humiliate|bully|demean|shame|harass/.test(t)) push("conviction","C1_dignity","Respect the inherent dignity of all persons.");
  let risk = Math.min(1, triggers.length * 0.25);
  let route = risk >= 0.7 ? "ESCALATE" : risk >= 0.5 ? "CLARIFY" : risk >= 0.25 ? "ALLOW_WITH_CAUTIONS" : "ALLOW";
  return { route, risk, triggers, message: route==="ALLOW"?"Approved: No material conflicts.":
    route==="ALLOW_WITH_CAUTIONS"?"Allowed with cautions.":route==="CLARIFY"?"Clarification required.":"Escalation required." };
}

const OPENAI_BASE = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini"; // fast, cheap; change if you like

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") return json(204, {});
    if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

    let payload = {};
    try { payload = JSON.parse(event.body || "{}"); }
    catch { return json(400, { error: "Invalid JSON body" }); }

    const dilemma = (payload.dilemma || "").trim();
    const context = payload.context || {};
    if (dilemma.length < 10) return json(400, { error: "Please provide a dilemma (≥ 10 chars)." });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return json(500, { error: "OPENAI_API_KEY not set" });

    const accord = loadAccord();

    // Build compact, in-context “rulebook”
    const rulebook = {
      convictions: accord.convictions?.convictions || {},
      safeguards:  accord.safeguards?.safeguards  || {},
      principles:  accord.principles?.principles  || {}
    };

    // Strict reply contract for the model
    const outputContract = {
      type: "object",
      properties: {
        route: { enum: ["ALLOW","ALLOW_WITH_CAUTIONS","CLARIFY","ESCALATE"] },
        composite: {
          type: "object",
          properties: {
            risk: { type: "number" },
            urgency: { enum: ["low","medium","high","critical"] }
          },
          required: ["risk","urgency"]
        },
        triggers: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { enum: ["conviction","safeguard","principle"] },
              code: { type: "string" },
              text: { type: "string" }
            },
            required: ["type","code","text"]
          }
        },
        message: { type: "string" }
      },
      required: ["route","composite","triggers","message"],
      additionalProperties: false
    };

    // System prompt + instructions
    const sys = [
      "You are Virelia, applying the Bronze Accord ethical framework.",
      "Use the YAML reservoirs (convictions, safeguards, principles) to evaluate the dilemma.",
      "Return ONLY the JSON object that matches the provided schema.",
      "If the dilemma suggests imminent harm, illegal activity, or severe abuse, route = ESCALATE.",
      "Prefer fairness over speed unless true urgency is specified."
    ].join(" ");

    const user = {
      dilemma,
      context,
      rulebook,              // the belief reservoirs
      guidance: {
        // The 4 properties define cognition (for reference); governance decides routing.
        routing: {
          highRisk: "ESCALATE",
          mediumRisk: "CLARIFY",
          lowRisk: "ALLOW_WITH_CAUTIONS",
          minimalRisk: "ALLOW"
        }
      }
    };

    // Ask the LLM
    const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.2,
        response_format: { type: "json_schema", json_schema: { name: "verdict", schema: outputContract, strict: true } },
        messages: [
          { role: "system", content: sys },
          { role: "user", content: JSON.stringify(user) }
        ]
      })
    });

    if (!res.ok) {
      const txt = await res.text().catch(()=> "");
      // fallback to heuristics if LLM fails
      const fb = heuristicFallback(dilemma);
      return json(200, {
        timestamp: new Date().toISOString(),
        composite: { risk: Number(fb.risk.toFixed(2)), urgency: fb.route==="ESCALATE"?"high":fb.route==="CLARIFY"?"medium":"low" },
        route: fb.route,
        triggers: fb.triggers,
        message: `[Fallback] ${fb.message} • LLM error: ${res.status} ${res.statusText} ${txt.slice(0,180)}`
      });
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content); // guaranteed by response_format

    return json(200, {
      timestamp: new Date().toISOString(),
      ...parsed
    });

  } catch (e) {
    // last-resort fallback
    return json(500, { error: e.message });
  }
};
