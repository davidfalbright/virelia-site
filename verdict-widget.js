// verdict-widget.js
document.addEventListener("DOMContentLoaded", () => {
  const buttonEl   = document.getElementById("getVerdictBtn");
  const inputEl    = document.getElementById("dilemmaInput");
  const messageEl  = document.getElementById("verdictMessage");

  if (!buttonEl) {
    alert("Get Verdict button not found on this page.");
    return;
  }
  if (!inputEl) {
    alert("Dilemma textarea not found on this page.");
    return;
  }
  if (!messageEl) {
    console.warn("No #verdictMessage element; output will not be visible.");
  }

  buttonEl.addEventListener("click", async () => {
    alert("Get Verdict Btn was clicked");

    const dilemma = inputEl.value.trim();
    if (!dilemma) {
      alert("Please enter a dilemma.");
      return;
    }

    try {
      // Step 1: Pre-process
      const pre = lumenPreProcess(dilemma);
      console.log("Preprocessed prompt:", pre);

      // Step 2: Send to LLM
      const llmResponse = await callLLM(pre);
      console.log("Raw LLM response:", llmResponse);

      // Step 3: Post-process
      const finalOutput = lumenPostProcess(llmResponse);

      // Step 4: Display
      if (messageEl) {
        messageEl.textContent = finalOutput;
      } else {
        alert(finalOutput);
      }
    } catch (err) {
      const msg = "Error: " + (err?.message || String(err));
      console.error(err);
      if (messageEl) {
        messageEl.textContent = msg;
      } else {
        alert(msg);
      }
    }
  });

  // =============================================================
  // PRE-PROCESSING (LUMEN-PRE)
  // =============================================================
  function lumenPreProcess(inputText) {
    // TODO: Replace with your actual LUMEN epistemology/perception logic
    return "[LUMEN-PRE] " + inputText.trim();
  }

  // =============================================================
  // POST-PROCESSING (LUMEN-POST)
  // =============================================================
  function lumenPostProcess(llmOutput) {
    // TODO: Replace with hallucination checking, safeguard logic, etc.
    return llmOutput.replace("Ollama:", "LUMEN:");
  }

  /*
  // -------- Option A: Local Ollama (http://localhost:11434) --------
  async function callLLM(prompt) {
    alert(`Your PROMPT being sent is: ${prompt}`);

    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3.1",   // Or any model you installed in Ollama
        prompt: prompt
      })
    });

    if (!response.ok) {
      throw new Error(`LLM HTTP error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.response;
  }
  */

  /*
  // -------- Option B: OpenRouter Free Tier (cloud) --------
  async function callLLM(prompt) {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer YOUR_API_KEY_HERE"
      },
      body: JSON.stringify({
        model: "meta-llama/Llama-3-8b-chat-hf",
        messages: [
          { role: "user", content: prompt }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter HTTP error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }
  */
  
// -------- Option C: Let Netlify/OpenRouter handle the LLM API call --------
async function callLLM(prompt) {
  const res = await fetch("/.netlify/functions/lumen-llm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });

  if (!res.ok) {
    throw new Error(`LLM proxy returned ${res.status}`);
  }

  const data = await res.json();
  return data.response;
}


  
});
