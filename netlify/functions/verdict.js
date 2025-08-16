// LLM-powered Bronze Accord verdict (Netlify Function)
// POST /api/verdict  →  /.netlify/functions/verdict
// Required env: OPENAI_API_KEY
// Optional env: OPENAI_MODEL (default gpt-4o-mini), OPENAI_BASE_URL, VIRELIA_OFFLINE=1

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

// ---------- helpers ----------
function json(status, body) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",               // tighten to your domain in prod
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST,OPTIONS"
    },
    body: JSON.stringify(body || {}, null, 2)
  };
}
function isQuotaOrRateLimit(status, text) {
  if (status === 429 || status === 402 || status === 403) return true;
  const s = (text || "").toLowerCase();
  return s.includes("rate limit") || s.includes("quota") || s.includes("billing");
}
function safeLoadYaml(p) {
  try { return yaml.load(fs.readFileSync(p, "utf8")); }
  catch (e) { throw new Error(`Failed to load ${p}: ${e.message}`); }
}

// ---------- load Bronze Accord reservoirs (bundled via netlify.toml included_files) ----------
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

// ---------- heuristic fallback (no LLM) ----------
function heuristicFallback(dilemma) {
  const t = (dilemma || "").toLowerCase();
  const triggers = [];
  const push = (type, code, text) => triggers.push({ type, code, text });

  // simple signals — expand to your needs
  if (/\bsteal|rob|mug|take .* money|extort|threat(en|s)?\b/.test(t)) {
    push("safeguard","S1_harm_prevention","Avoid actions likely to cause physical or severe psychological harm.");
  }
  if (/coerce|without consent|force|blackmail/.test(t)) {
    push("conviction","C2_consent","Honor informed consent and avoid coercion.");
  }
  if (/humiliate|bully|demean|shame|harass/.test(t)) {
    push("conviction","C1_dignity","Respect the inherent dignity of all persons.");
  }
  if (/unfair|skip the line|discriminate/.test(t)) {
    push("principle","P2_equity_over_efficiency","If fairness conflicts with speed, prefer fairness unless there is true urgency.");
  }

  let risk = Math.min(1, triggers.length * 0.25);
  let route = risk >= 0.70 ? "ESCALATE" : risk >= 0.50 ? "CLARIFY" : risk >= 0.25 ? "ALLOW_WITH_CAUTIONS" : "ALLOW";
  return {
    route,
    risk,
    triggers,
    message:
      route === "ALLOW" ? "Approved: No material conflicts." :
      route === "ALLOW_WITH_CAUTIONS" ? "Allowed with cautions." :
      route === "CLARIFY" ? "Clarification required." :
      "Escalation required."
  };
}

// ---------- OpenAI config ----------
const OPENAI_BASE = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OFFLINE = process.env.VIRELIA_OFFLINE === "1";

// strict reply contract (JSON schema) for the LLM
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

// one retry with tiny backoff for 429s
async function callOpenAI(body, apiKey, base) {
  const attempt = async () => {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify(body)
    });
    const txt = await res.text();
    return { ok: res.ok, status: res.status, txt };
  };
  let r = await attempt();
  if (!r.ok && r.status === 429) {
    await new Promise(r => setTimeout(r, 400));
    r = await attempt();
  }
  return r;
}

// ---------- handler ----------
exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") return json(204, {});
    if (event.httpMethod !== "POST")    return json(405, { error: "Method Not Allowed" });

    // parse input
    let payload = {};
    try { payload = JSON.parse(event.body || "{}"); }
    catch { return json(400, { error: "Invalid JSON body" }); }

    const dilemma = (payload.dilemma || "").trim();
    const context = payload.context || {};
    if (dilemma.length < 10) return json(400, { error: "Please provide a dilemma (≥ 10 chars)." });

    // offline mode or missing key → fallback
    const apiKey = process.env.OPENAI_API_KEY;
    if (OFFLINE || !apiKey) {
      const fb = heuristicFallback(dilemma);
      return json(200, {
        timestamp: new Date().toISOString(),
        composite: { risk: Number(fb.risk.toFixed(2)), urgency: fb.route==="ESCALATE"?"high":fb.route==="CLARIFY"?"medium":"low" },
        route: fb.route,
        triggers: fb.triggers,
        message: OFFLINE ? "Operating in offline (fallback) mode." : "Using local ethics fallback (no API key configured)."
      });
    }

    // load reservoirs and prepare rulebook
    const accord = loadAccord();
    const rulebook = {
      convictions: accord.convictions?.convictions || {},
      safeguards:  accord.safeguards?.safeguards  || {},
      principles:  accord.principles?.principles  || {}
    };

    // prompts
    const sys = [
      "You are Virelia, applying the Bronze Accord ethical framework.",
      "Use the provided rulebook (convictions, safeguards, principles) to evaluate the dilemma.",
      "Return ONLY the JSON object that matches the provided schema.",
      "If the dilemma suggests imminent harm, illegal activity, or severe abuse, route = ESCALATE.",
      "Prefer fairness over speed unless true urgency is specified."
    ].join(" ");

    const user = { dilemma, context, rulebook, guidance: {
      routing: { highRisk: "ESCALATE", mediumRisk: "CLARIFY", lowRisk: "ALLOW_WITH_CAUTIONS", minimalRisk: "ALLOW" }
    }};

    // request body for OpenAI
    const body = {
      model: OPENAI_MODEL,
      temperature: 0.2,
      response_format: { type: "json_schema", json_schema: { name: "verdict", schema: outputContract, strict: true } },
      messages: [
        { role: "system", content: sys },
        { role: "user", content: JSON.stringify(user) }
      ]
    };

    // call OpenAI with graceful fallback
    const r = await callOpenAI(body, apiKey, OPENAI_BASE);
    if (!r.ok) {
      if (isQuotaOrRateLimit(r.status, r.txt)) {
        const fb = heuristicFallback(dilemma);
        return json(200, {
          timestamp: new Date().toISOString(),
          composite: { risk: Number(fb.risk.toFixed(2)), urgency: fb.route==="ESCALATE"?"high":fb.route==="CLARIFY"?"medium":"low" },
          route: fb.route,
          triggers: fb.triggers,
          message: "Using local ethics fallback (API temporarily unavailable)."
        });
      }
      return json(502, { error: `Upstream model error (${r.status}). Please try again.` });
    }

    // parse strict JSON from OpenAI (response_format enforces JSON content)
    let parsed;
    try {
      const data = JSON.parse(r.txt);
      const content = data.choices?.[0]?.message?.content || "{}";
      parsed = JSON.parse(content);
    } catch {
      const fb = heuristicFallback(dilemma);
      return json(200, {
        timestamp: new Date().toISOString(),
        composite: { risk: Number(fb.risk.toFixed(2)), urgency: fb.route==="ESCALATE"?"high":fb.route==="CLARIFY"?"medium":"low" },
        route: fb.route,
        triggers: fb.triggers,
        message: "Using local ethics fallback (invalid model response)."
      });
    }

    return json(200, { timestamp: new Date().toISOString(), ...parsed });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
