document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("verdict-widget");
  if (!container) return;

  container.innerHTML = `
    <textarea id="dilemmaInput" placeholder="Enter your dilemma..."></textarea>
    <button id="getVerdictBtn">Get Verdict</button>
    <pre id="verdictOutput"></pre>
  `;

  document.getElementById("getVerdictBtn").addEventListener("click", async () => {
    const dilemma = document.getElementById("dilemmaInput").value.trim();
    if (!dilemma) return alert("Please enter a dilemma.");

    const res = await fetch("/.netlify/verdict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dilemma })
    });

    const data = await res.json();
    document.getElementById("verdictOutput").textContent = JSON.stringify(data, null, 2);
  });
});
