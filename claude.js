// Calls the Anthropic Messages API from the SERVER so the key is never sent to the browser.
const SYSTEM_PROMPT = `You are an educational financial literacy assistant for students and general users in India.
Rules: use simple language and short paragraphs (max about 200 words); give practical, general guidance;
do not claim to be a financial advisor; never guarantee loan approval, returns or investment outcomes;
do not ask for sensitive details (PAN, Aadhaar, bank account numbers, passwords);
if the question is unrelated to personal finance, politely say you can only help with finance basics;
end with one line: "This is educational guidance, not professional financial advice."`;

async function askClaude(question) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key.startsWith("your_")) {
    const e = new Error("ANTHROPIC_API_KEY is not configured on the server.");
    e.status = 503; throw e;
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: question }],
    }),
  });
  if (!res.ok) {
    const e = new Error(`Claude API error (${res.status}).`); e.status = 502; throw e;
  }
  const data = await res.json();
  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
  if (!text) { const e = new Error("Claude returned an empty response."); e.status = 502; throw e; }
  return text;
}
module.exports = { askClaude };
