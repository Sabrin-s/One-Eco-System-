// Shared browser helper for AI card extraction (local Ollama vision model,
// see src/lib/card-ai.js). Used by card-scrape.js and admin.js.

window.CardAI = (function () {
  let statusPromise = null;

  function status() {
    if (!statusPromise) {
      statusPromise = fetch("/api/admin/card-ai/status")
        .then(r => (r.ok ? r.json() : { available: false, reason: "Sign in as admin to use AI extraction." }))
        .catch(() => ({ available: false, reason: "Server not reachable." }))
        .then(s => { if (!s.available) statusPromise = null; return s; }); // re-check next card if it was down
    }
    return statusPromise;
  }

  // Re-encode as JPEG with the long side at ~1280px: big enough that the model
  // reads small print accurately (smaller sizes made it invent values in testing).
  async function fileToBase64(file, maxSide = 1280) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.9).split(",")[1];
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function titleCase(s) {
    if (!s || s !== s.toUpperCase()) return s;
    return s.toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase());
  }

  // Turn printed @handles into the URL forms the registry stores.
  function normalize(f) {
    const out = { ...f };
    ["full_name", "designation", "business_name", "tagline", "city"].forEach(k => { out[k] = titleCase(out[k] || ""); });
    const handle = (v) => (v || "").trim().replace(/^@/, "");
    const asUrl = (v, base) => {
      if (!v) return "";
      if (/^(https?:\/\/)?(www\.)?[a-z0-9-]+\.[a-z]/i.test(v) && v.includes("/")) return v;
      return `${base}${handle(v)}`;
    };
    if (out.facebook_url) out.facebook_url = asUrl(out.facebook_url, "facebook.com/");
    if (out.linkedin_url) out.linkedin_url = asUrl(out.linkedin_url, "linkedin.com/in/");
    if (out.youtube_url) out.youtube_url = asUrl(out.youtube_url, "youtube.com/@");
    if (out.instagram_url && !/instagram\.com/i.test(out.instagram_url)) out.instagram_url = `@${handle(out.instagram_url)}`;
    return out;
  }

  async function extract(file) {
    const image = await fileToBase64(file);
    const res = await fetch("/api/admin/card-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || "AI extraction failed.");
    return { fields: normalize(data.fields), model: data.model, seconds: data.seconds };
  }

  return { status, extract, normalize };
})();
