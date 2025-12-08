document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("verdict-widget");
  if (!container) return;

  container.innerHTML = `
    // <textarea id="dilemmaInput" placeholder="Enter your dilemma..."></textarea>
    <textarea id="dilemmaInput" placeholder="Virelia is temporarily offline — API not connected.."></textarea>
    dilemmaInput.disabled = false;
    
    <button id="getVerdictBtn">Get Verdict</button>
    getVerdictBtn.disabled = true;
    
    <pre id="verdictOutput"></pre>
  `;

  document.getElementById("getVerdictBtn").addEventListener("click", async () => {
    const dilemma = document.getElementById("dilemmaInput").value.trim();
    if (!dilemma) return alert("Please enter a dilemma.");


//    const res = await fetch("verdict", {
//      method: "POST",
//      headers: { "Content-Type": "application/json" },
//      body: JSON.stringify({ dilemma })
//    });

try {
        // Step 1: Pre-process
        const pre = lumenPreProcess(dilemma);

        // Step 2: Send to LLM
        const llmResponse = await callLLM(pre);

        // Step 3: Post-process
        const finalOutput = lumenPostProcess(llmResponse);

        // Step 4: Display
       // resultBox.innerHTML = finalOutput;
  document.getElementById("verdictOutput").textContent = finalOutput;

    } catch (err) {
        //resultBox.innerHTML = "Error: " + err.message;
  document.getElementById("verdictOutput").textContent ="Error: " + err.message;
    }



    
    //const data = await res.json();
    //document.getElementById("verdictOutput").textContent = JSON.stringify(data, null, 2);
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

// -------- Option A: Local OLlama (http://localhost:11434) --------
async function callLLM(prompt) {
    const response = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: "llama3.1",        // Or any model you installed
            prompt: prompt
        })
    });

    const data = await response.json();
    return data.response;
}

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

    const data = await response.json();
    return data.choices[0].message.content;
}
*/


  
  
}
);
