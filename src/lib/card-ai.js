// Visiting-card extraction with an open-source vision model, from one of two providers:
//
//   groq   — Groq's hosted API (https://console.groq.com) running open-source Qwen.
//            Used on the live site. Fast (seconds), free tier with daily limits,
//            card photos are sent to Groq. Set GROQ_API_KEY to enable.
//   ollama — Ollama on this computer (https://ollama.com). Nothing leaves the
//            machine. qwen3.5:4b was tested on a sideways, dim card photo: all
//            fields correct at ~1280px, but ~30 s–2.5 min per card on CPU only.
//
// AI_PROVIDER picks one explicitly; otherwise Groq is used when a key is set.

const provider = () => {
  const p = (process.env.AI_PROVIDER || "").trim().toLowerCase();
  if (p === "groq" || p === "ollama") return p;
  return process.env.GROQ_API_KEY ? "groq" : "ollama";
};

// 127.0.0.1 rather than localhost: Node tries IPv6 (::1) first for localhost,
// which Ollama doesn't listen on by default, adding delay to every call.
const OLLAMA_URL = () => (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
const OLLAMA_MODEL = () => process.env.OLLAMA_VISION_MODEL || "qwen3.5:4b";
const GROQ_URL = () => process.env.GROQ_API_URL || "https://api.groq.com/openai/v1/chat/completions";
// Groq's only vision model at the time of writing (console.groq.com/docs/vision).
const GROQ_MODEL = () => process.env.GROQ_VISION_MODEL || "qwen/qwen3.8-27b";
const model = () => (provider() === "groq" ? GROQ_MODEL() : OLLAMA_MODEL());

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

// Groq's JSON mode takes no schema, so the keys are spelled out in the prompt.
const GROQ_PROMPT = `${PROMPT}
Reply with one JSON object with exactly these string keys: ${CARD_FIELDS.join(", ")}.`;

async function status() {
  if (provider() === "groq") {
    return process.env.GROQ_API_KEY
      ? { available: true, provider: "groq", model: GROQ_MODEL() }
      : { available: false, provider: "groq", model: GROQ_MODEL(), reason: "GROQ_API_KEY is not set on the server." };
  }
  try {
    // Generous timeout: Ollama answers slowly while another card is being read.
    const res = await fetch(`${OLLAMA_URL()}/api/tags`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { available: false, provider: "ollama", model: OLLAMA_MODEL(), reason: "Ollama did not respond." };
    const { models = [] } = await res.json();
    const installed = models.some(m => m.name === OLLAMA_MODEL() || m.model === OLLAMA_MODEL());
    return installed
      ? { available: true, provider: "ollama", model: OLLAMA_MODEL() }
      : { available: false, provider: "ollama", model: OLLAMA_MODEL(), reason: `Model ${OLLAMA_MODEL()} is not installed. Run: ollama pull ${OLLAMA_MODEL()}` };
  } catch {
    // Expected on hosted deployments without GROQ_API_KEY, where Ollama isn't installed.
    return { available: false, provider: "ollama", model: OLLAMA_MODEL(), reason: "the AI model isn't available on this server (no GROQ_API_KEY and Ollama not reachable). The quick scan still works." };
  }
}

async function askOllama(imageBase64) {
  const res = await fetch(`${OLLAMA_URL()}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(6 * 60 * 1000),
    body: JSON.stringify({
      model: OLLAMA_MODEL(),
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
  return data.message?.content || "";
}

async function askGroq(imageBase64) {
  const res = await fetch(GROQ_URL(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    signal: AbortSignal.timeout(90 * 1000),
    body: JSON.stringify({
      model: GROQ_MODEL(),
      temperature: 0,
      response_format: { type: "json_object" },
      // JSON mode needs reasoning hidden or parsed; "none" skips reasoning for speed.
      reasoning_format: "hidden",
      reasoning_effort: "none",
      messages: [{
        role: "user",
        content: [
          { type: "text", text: GROQ_PROMPT },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
        ]
      }]
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error?.message || `HTTP ${res.status}`;
    if (res.status === 401) throw new Error("Groq rejected the API key. Check GROQ_API_KEY on the server.");
    if (res.status === 429) throw new Error("Groq's free-tier limit was reached. Try again in a minute.");
    throw new Error(`Groq error: ${msg}`);
  }
  return data.choices?.[0]?.message?.content || "";
}

async function extractCard(imageBase64) {
  const started = Date.now();
  const content = provider() === "groq" ? await askGroq(imageBase64) : await askOllama(imageBase64);

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("The model's answer was not valid JSON.");
  }
  const fields = {};
  for (const key of CARD_FIELDS) {
    const value = parsed[key];
    fields[key] = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
  }
  return { fields, provider: provider(), model: model(), seconds: Math.round((Date.now() - started) / 1000) };
}

module.exports = { status, extractCard, CARD_FIELDS };
