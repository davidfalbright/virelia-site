// netlify/functions/llm-proxy.js

// Simple CORS helper so the browser can call this from iamvirelia.org
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

exports.handler = async function (event, context) {
  // Handle preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const { prompt } = JSON.parse(event.body || "{}");
    if (!prompt || typeof prompt !== "string") {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Missing 'prompt' in request body" }),
      };
    }

    // ---- CALL YOUR LLM PROVIDER HERE ----
    // Example using OpenRouter (free-ish tier) as the backend.
    // Put your actual API key into Netlify env var OPENROUTER_API_KEY.
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "OPENROUTER_API_KEY is not configured" }),
      };
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        // These two headers are recommended by OpenRouter for attribution:
        "HTTP-Referer": "https://iamvirelia.org",
        "X-Title": "Virelia LUMEN Demo",
      },
      body: JSON.stringify({
        model: "meta-llama/Meta-Llama-3-8B-Instruct", // pick any OpenRouter model you like
        messages: [
          { role: "user", content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        statusCode: 502,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: "LLM backend error",
          status: response.status,
          body: text,
        }),
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? "";

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ response: content }),
    };
  } catch (err) {
    console.error("llm-proxy error:", err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Internal error", detail: String(err) }),
    };
  }
};
