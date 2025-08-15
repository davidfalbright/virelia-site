const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

exports.handler = async (event) => {
  try {
    const { dilemma } = JSON.parse(event.body || "{}");

    if (!dilemma) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing dilemma text" }),
      };
    }

    // Load YAML reservoirs (replace filenames with your actual Bronze Accord YAML files)
    const convictions = yaml.load(
      fs.readFileSync(path.join(__dirname, "../accord/convictions.yaml"), "utf8")
    );
    const safeguards = yaml.load(
      fs.readFileSync(path.join(__dirname, "../accord/safeguards.yaml"), "utf8")
    );
    const principles = yaml.load(
      fs.readFileSync(path.join(__dirname, "../accord/principles.yaml"), "utf8")
    );

    // Simple keyword-based matching (replace with real ethics engine later)
    const lower = dilemma.toLowerCase();
    const triggers = [];

    convictions.forEach(c => {
      if (lower.includes(c.keyword.toLowerCase())) {
        triggers.push({ type: "Conviction", name: c.name, intent: c.intent });
      }
    });

    safeguards.forEach(s => {
      if (lower.includes(s.keyword.toLowerCase())) {
        triggers.push({ type: "Safeguard", name: s.name, intent: s.intent });
      }
    });

    principles.forEach(p => {
      if (lower.includes(p.keyword.toLowerCase())) {
        triggers.push({ type: "Principle", name: p.name, intent: p.intent });
      }
    });

    // Decide verdict (placeholder logic — refine later)
    let verdict = "ALLOW";
    if (triggers.length > 3) verdict = "ESCALATE";
    else if (triggers.length > 0) verdict = "ALLOW_WITH_CAUTIONS";

    return {
      statusCode: 200,
      body: JSON.stringify({
        dilemma,
        verdict,
        triggers
      }),
    };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
