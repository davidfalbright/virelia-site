// netlify/functions/llm-proxy.js

// https://openrouter.ai/   iamgr8guy!

export default async (req, context) => {
  try {
    // Ensure POST only
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const { prompt } = await req.json();

    if (!prompt) {
      return new Response(JSON.stringify({ error: "Missing prompt" }), { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing OpenRouter API key" }), { status: 500 });
    }

    // OpenRouter expects ChatCompletions-style body
    const payload = {
      model: "meta-llama/Llama-3-8b-chat-hf",
      messages: [
        { role: "user", content: prompt }
      ]
    };

    const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://iamvirelia.org",
        "X-Title": "Virelia Ethics Engine"
      },
      body: JSON.stringify(payload)
    });

    if (!openRouterResponse.ok) {
      const errorText = await openRouterResponse.text();
      alert("OpenRouter ERROR: " + errorText);
      return new Response(JSON.stringify({ error: `OpenRouter returned ${openRouterResponse.status}` }), {
        status: 502
      });
    }

    const data = await openRouterResponse.json();

    return new Response(
      JSON.stringify({ response: data.choices[0].message.content }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    alert("Proxy EXCEPTION: "+ err);
    return new Response(JSON.stringify({ error: "Internal Error" }), { status: 500 });
  }
};
