const express = require("express");
const fs = require("fs");
const { BOOKINGS_CSV } = require("../config/paths");
const { ensureCsv, appendRow, readCsvAsJson } = require("../lib/csv-store");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

const bookingHeader = [
  { id: "company", title: "Company" },
  { id: "companySlug", title: "CompanySlug" },
  { id: "fullName", title: "FullName" },
  { id: "phone", title: "Phone" },
  { id: "email", title: "Email" },
  { id: "eventType", title: "EventType" },
  { id: "eventDate", title: "EventDate" },
  { id: "guestCount", title: "GuestCount" },
  { id: "city", title: "City" },
  { id: "budget", title: "Budget" },
  { id: "message", title: "Message" },
  { id: "submittedAt", title: "SubmittedAt" }
];

// normalize CSV header names (Title Case) back to camelCase keys used by the frontend
function normalizeBookingRow(r) {
  return {
    company: r.Company, companySlug: r.CompanySlug, fullName: r.FullName, phone: r.Phone,
    email: r.Email, eventType: r.EventType, eventDate: r.EventDate, guestCount: r.GuestCount,
    city: r.City, budget: r.Budget, message: r.Message, submittedAt: r.SubmittedAt
  };
}

router.post("/api/booking", async (req, res) => {
  try {
    const b = req.body || {};
    const row = {
      company: b.company || "", companySlug: b.companySlug || "", fullName: b.fullName || "",
      phone: b.phone || "", email: b.email || "", eventType: b.eventType || "", eventDate: b.eventDate || "",
      guestCount: b.guestCount || "", city: b.city || "", budget: b.budget || "", message: b.message || "",
      submittedAt: b.submittedAt || new Date().toISOString()
    };
    await ensureCsv(BOOKINGS_CSV, bookingHeader);
    await appendRow(BOOKINGS_CSV, bookingHeader, row);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Could not save booking." });
  }
});

router.get("/api/bookings", requireAdmin, async (req, res) => {
  const rows = await readCsvAsJson(BOOKINGS_CSV);
  res.json(rows.map(normalizeBookingRow).reverse());
});

router.get("/api/bookings.csv", requireAdmin, (req, res) => {
  if (!fs.existsSync(BOOKINGS_CSV)) return res.status(404).send("No bookings yet.");
  res.download(BOOKINGS_CSV, "bookings.csv");
});

module.exports = router;
