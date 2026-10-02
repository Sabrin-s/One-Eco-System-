// Admin: visiting-card contacts from the original OCR scanner on the admin panel
const express = require("express");
const fs = require("fs");
const { CONTACTS_CSV } = require("../config/paths");
const { ensureCsv, appendRow, readCsvAsJson } = require("../lib/csv-store");
const { sendToN8n } = require("../lib/n8n");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

const contactHeader = [
  { id: "name", title: "Name" },
  { id: "role", title: "Role" },
  { id: "company", title: "Company" },
  { id: "email", title: "Email" },
  { id: "phone", title: "Phone" },
  { id: "instagram", title: "Instagram" },
  { id: "address", title: "Address" },
  { id: "other", title: "Other" },
  { id: "addedAt", title: "AddedAt" }
];

function normalizeContactRow(r) {
  return {
    name: r.Name, role: r.Role, company: r.Company, email: r.Email, phone: r.Phone,
    instagram: r.Instagram, address: r.Address, other: r.Other, addedAt: r.AddedAt
  };
}

router.post("/api/admin/contact", requireAdmin, async (req, res) => {
  try {
    const c = req.body || {};
    const row = {
      name: c.name || "", role: c.role || "", company: c.company || "", email: c.email || "",
      phone: c.phone || "", instagram: c.instagram || "", address: c.address || "", other: c.other || "",
      addedAt: c.addedAt || new Date().toISOString()
    };
    await ensureCsv(CONTACTS_CSV, contactHeader);
    await appendRow(CONTACTS_CSV, contactHeader, row);
    const automation = await sendToN8n(process.env.N8N_CONTACT_WEBHOOK_URL, {
      type: "contact.created", contact: { ...row }
    });
    res.json({ ok: true, automation });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Could not save contact." });
  }
});

router.get("/api/contacts", async (req, res) => {
  if (!req.user) return res.status(401).json({ ok: false, error: "Admin sign-in required." });
  const rows = await readCsvAsJson(CONTACTS_CSV);
  res.json(rows.map(normalizeContactRow).reverse());
});

router.get("/api/contacts.csv", requireAdmin, (req, res) => {
  if (!fs.existsSync(CONTACTS_CSV)) return res.status(404).send("No contacts yet.");
  res.download(CONTACTS_CSV, "contacts.csv");
});

module.exports = router;
