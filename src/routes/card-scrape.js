// Admin: Partner Registry card-scrape records (38 fields, same column order
// as the "Card Scrape Template" tab of docs/reference/Partner_Registry_Fields.xlsx)
const express = require("express");
const fs = require("fs");
const { CARD_SCRAPE_CSV } = require("../config/paths");
const { ensureCsv, appendRow, readCsvAsJson } = require("../lib/csv-store");
const { toE164, withScheme, istTimestamp } = require("../lib/format");
const { sendToN8n } = require("../lib/n8n");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

const CARD_SCRAPE_FIELDS = [
  "full_name", "designation", "business_name", "tagline",
  "phone_primary", "phone_secondary", "whatsapp_number", "email_primary", "email_secondary", "address", "city",
  "website_url", "instagram_url", "linkedin_url", "facebook_url", "youtube_url", "google_maps_url", "other_links", "qr_payload",
  "visiting_card_url", "profile_pdf_url", "intro_video_url", "drive_folder_url",
  "brief_summary", "brief_services", "brief_coverage", "brief_sources", "brief_open_questions", "extraction_confidence",
  "event_name", "met_on", "conversation_notes", "follow_up_priority",
  "entity_id", "captured_at", "captured_by", "record_status", "card_verified"
];
const cardScrapeHeader = CARD_SCRAPE_FIELDS.map(id => ({ id, title: id }));
const URL_FIELDS = ["website_url", "instagram_url", "linkedin_url", "facebook_url", "youtube_url", "google_maps_url",
  "visiting_card_url", "profile_pdf_url", "intro_video_url", "drive_folder_url"];
const PHONE_FIELDS = ["phone_primary", "phone_secondary", "whatsapp_number"];

router.post("/api/admin/card-scrape", requireAdmin, async (req, res) => {
  try {
    const input = req.body || {};
    const row = {};
    for (const key of CARD_SCRAPE_FIELDS) row[key] = String(input[key] ?? "").trim();
    PHONE_FIELDS.forEach(k => { row[k] = toE164(row[k]); });
    URL_FIELDS.forEach(k => { row[k] = withScheme(row[k]); });
    if (row.instagram_url && !row.instagram_url.includes("instagram.com")) {
      row.instagram_url = `https://instagram.com/${row.instagram_url.replace(/^https?:\/\//, "").replace(/^@/, "")}`;
    }
    if (!row.full_name && !row.phone_primary && !row.business_name) {
      return res.status(400).json({ ok: false, error: "Add at least a name, business name or phone number." });
    }

    const existing = await readCsvAsJson(CARD_SCRAPE_CSV);
    const lastId = existing.reduce((max, r) => Math.max(max, parseInt((r.entity_id || "").replace(/\D/g, ""), 10) || 0), 0);
    row.entity_id = `E-${String(lastId + 1).padStart(6, "0")}`;
    row.captured_at = istTimestamp();
    row.captured_by = req.user.email;
    row.record_status = "draft";
    row.card_verified = row.card_verified === "true" ? "true" : "false";
    if (!row.met_on) row.met_on = row.captured_at.slice(0, 10);

    await ensureCsv(CARD_SCRAPE_CSV, cardScrapeHeader);
    await appendRow(CARD_SCRAPE_CSV, cardScrapeHeader, row);
    const automation = await sendToN8n(process.env.N8N_CONTACT_WEBHOOK_URL, { type: "card_scrape.created", record: { ...row } });
    res.json({ ok: true, record: row, automation });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Could not save card record." });
  }
});

router.get("/api/admin/card-scrape", requireAdmin, async (req, res) => {
  const rows = await readCsvAsJson(CARD_SCRAPE_CSV);
  res.json(rows.reverse());
});

router.get("/api/admin/card-scrape.csv", requireAdmin, (req, res) => {
  if (!fs.existsSync(CARD_SCRAPE_CSV)) return res.status(404).send("No card records yet.");
  res.download(CARD_SCRAPE_CSV, "card-scrape.csv");
});

module.exports = router;
