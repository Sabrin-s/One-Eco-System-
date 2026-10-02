// Visiting-card extraction with a local open-source vision model served by
// Ollama (https://ollama.com). Nothing leaves the machine.
//
// Default model qwen3.5:4b was tested on a sideways, dim card photo: all
// fields correct at ~1280px, but ~2.5 min per card on a CPU-only laptop.
// Smaller images were faster but invented a business name, so keep ~1280px.

// 127.0.0.1 rather than localhost: Node tries IPv6 (::1) first for localhost,
// which Ollama doesn't listen on by default, adding delay to every call.
const OLLAMA_URL = () => (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
const MODEL = () => process.env.OLLAMA_VISION_MODEL || "qwen3.5:4b";
const TIMEOUT_MS = 6 * 60 * 1000;

const CARD_FIELDS = [
  "full_name", "designation", "business_name", "tagline",
  "phone_primary", "phone_secondary", "whatsapp_number", "email_primary", "email_secondary",
  "address", "city", "website_url", "instagram_url", "linkedin_url", "facebook_url", "youtube_url", "other_links"
];

const SCHEMA = {
  type: "object",
  properties: Object.fromEntries(CARD_FIELDS.map(k => [k, { type: "string" }])),
  required: CARD_FIELDS
};

// Keep this short: a longer rule list (per-platform icon hints) made the 4B
// model misspell text and put a Facebook handle under LinkedIn in testing.
const PROMPT = `Read this visiting card photo (it may be rotated) and extract the printed details.
Use "" for anything not printed on the card. Copy text exactly as printed; do not invent values.
Social handles: put each @handle in the field matching the icon next to it (Instagram camera icon -> instagram_url, Facebook "f" icon -> facebook_url).`;

async function status() {
  try {
    // Generous timeout: Ollama answers slowly while another card is being read.
    const res = await fetch(`${OLLAMA_URL()}/api/tags`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { available: false, model: MODEL(), reason: "Ollama did not respond." };
    const { models = [] } = await res.json();
    const installed = models.some(m => m.name === MODEL() || m.model === MODEL());
    return installed
      ? { available: true, model: MODEL() }
      : { available: false, model: MODEL(), reason: `Model ${MODEL()} is not installed. Run: ollama pull ${MODEL()}` };
  } catch {
    return { available: false, model: MODEL(), reason: "Ollama is not running on this computer." };
  }
}

async function extractCard(imageBase64) {
  const started = Date.now();
  const res = await fetch(`${OLLAMA_URL()}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model: MODEL(),
      stream: false,
      think: false,
      keep_alive: "30m", // keep the model loaded between cards
      format: SCHEMA,
      options: { temperature: 0 },
      messages: [{ role: "user", content: PROMPT, images: [imageBase64] }]
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || `Ollama returned HTTP ${res.status}.`);

  let parsed;
  try {
    parsed = JSON.parse(data.message?.content || "");
  } catch {
    throw new Error("The model's answer was not valid JSON.");
  }
  const fields = {};
  for (const key of CARD_FIELDS) {
    const value = typeof parsed[key] === "string" ? parsed[key].trim() : "";
    fields[key] = value;
  }
  return { fields, model: MODEL(), seconds: Math.round((Date.now() - started) / 1000) };
}

module.exports = { status, extractCard, CARD_FIELDS };
