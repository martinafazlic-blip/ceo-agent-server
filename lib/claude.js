const API_KEY = process.env.ANTHROPIC_API_KEY;

export async function callClaude(system, userMsg, maxTokens = 1000) {
  if (!API_KEY) throw new Error("ANTHROPIC_API_KEY non impostata nel file .env");

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userMsg }]
    })
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Errore API Anthropic (${resp.status}): ${errText}`);
  }
  const data = await resp.json();
  return (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
}

export function parseJSON(text) {
  let c = text.trim();
  c = c.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
  return JSON.parse(c);
}
