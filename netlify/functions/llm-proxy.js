// netlify/functions/llm-proxy.js

// https://openrouter.ai/   iamgr8guy!

console.log("LLM proxy invoked");

export default async (req, context) => {
  try {
    // POST only
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const { prompt } = await req.json();
    if (!prompt) {
      return new Response(
        JSON.stringify({ error: "Missing prompt" }),
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Missing OpenRouter API key" }),
        { status: 500 }
      );
    }

    // Valid OpenRouter model ID (see /api/v1/models)
    // List of valid OpenRouter model IDs ==> https://openrouter.ai/api/v1/models (or try at https://openrouter.ai/models)
    const myDefaultAIModel = "meta-llama/llama-3.1-8b-instruct";
    
    const payload = {
      model: myDefaultAIModel,
      messages: [
        { role: "user", content: prompt }
      ]
    };

    const openRouterResponse = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": "https://iamvirelia.org",
          "X-Title": "Virelia Ethics Engine"
        },
        body: JSON.stringify(payload)
      }
    );

    if (!openRouterResponse.ok) {
      const errorText = await openRouterResponse.text();
      console.log("OpenRouter ERROR:", errorText);
      return new Response(
        JSON.stringify({
          error: `OpenRouter returned ${openRouterResponse.status}`
        }),
        { status: 502 }
      );
    }

    const data = await openRouterResponse.json();

    return new Response(
      JSON.stringify({ response: data.choices[0].message.content }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.log("Proxy EXCEPTION:", err);
    return new Response(
      JSON.stringify({ error: "Internal Error" }),
      { status: 500 }
    );
  }
};







