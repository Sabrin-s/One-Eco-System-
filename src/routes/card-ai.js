// Admin: AI extraction of visiting-card fields via a local Ollama vision model.
const express = require("express");
const { status, extractCard } = require("../lib/card-ai");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

router.get("/api/admin/card-ai/status", requireAdmin, async (req, res) => {
  res.json(await status());
});

router.post("/api/admin/card-ai", requireAdmin, async (req, res) => {
  const raw = String(req.body?.image || "");
  const image = raw.replace(/^data:image\/[a-z+.-]+;base64,/i, "");
  if (!image || !/^[A-Za-z0-9+/=\s]+$/.test(image)) {
    return res.status(400).json({ ok: false, error: "Send the card photo as a base64 image." });
  }
  if (image.length * 0.75 > MAX_IMAGE_BYTES) {
    return res.status(413).json({ ok: false, error: "Image is too large. Use a photo under 8 MB." });
  }
  const check = await status();
  if (!check.available) return res.status(503).json({ ok: false, error: check.reason });
  try {
    const result = await extractCard(image);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("Card AI extraction failed:", err.message);
    const timedOut = err.name === "TimeoutError" || err.name === "AbortError";
    res.status(502).json({ ok: false, error: timedOut ? "The AI model took too long. Try again." : err.message });
  }
});

module.exports = router;
