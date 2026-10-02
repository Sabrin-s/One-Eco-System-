// Public events, attendee registration, and the admin event/roster flows
const express = require("express");
const crypto = require("crypto");
const { EVENTS_JSON, REGISTRATIONS_JSON } = require("../config/paths");
const { readJsonList, writeJsonList } = require("../lib/json-store");
const { sendToN8n } = require("../lib/n8n");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

router.get("/api/events", async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const events = await readJsonList(EVENTS_JSON);
    res.json(events.filter(event => event.status === "published" && event.eventDate >= today));
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: "Could not load events." });
  }
});

router.get("/api/admin/events", requireAdmin, async (req, res) => {
  const [events, registrations] = await Promise.all([
    readJsonList(EVENTS_JSON), readJsonList(REGISTRATIONS_JSON)
  ]);
  res.json(events.map(event => ({
    ...event,
    registeredCount: registrations.filter(row => row.eventId === event.id).reduce((total, row) => total + row.attendeeCount, 0)
  })).sort((a, b) => a.eventDate.localeCompare(b.eventDate)));
});

router.post("/api/admin/events", requireAdmin, async (req, res) => {
  const body = req.body || {};
  const title = String(body.title || "").trim();
  const eventDate = String(body.eventDate || "");
  const capacity = Number(body.capacity);
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !Number.isInteger(capacity) || capacity < 1) {
    return res.status(400).json({ ok: false, error: "Title, valid event date, and capacity are required." });
  }
  const event = {
    id: crypto.randomUUID(), title, description: String(body.description || "").trim(),
    venue: String(body.venue || "").trim(), city: String(body.city || "").trim(), eventDate,
    startTime: String(body.startTime || "").trim(), capacity,
    status: body.status === "published" ? "published" : "draft",
    createdAt: new Date().toISOString()
  };
  const events = await readJsonList(EVENTS_JSON);
  events.push(event);
  await writeJsonList(EVENTS_JSON, events);
  res.status(201).json({ ok: true, event });
});

router.patch("/api/admin/events/:id", requireAdmin, async (req, res) => {
  const events = await readJsonList(EVENTS_JSON);
  const event = events.find(row => row.id === req.params.id);
  if (!event) return res.status(404).json({ ok: false, error: "Event not found." });
  const body = req.body || {};
  if (body.status === "published" || body.status === "draft") event.status = body.status;
  if (typeof body.title === "string" && body.title.trim()) event.title = body.title.trim();
  await writeJsonList(EVENTS_JSON, events);
  res.json({ ok: true, event });
});

router.post("/api/events/:id/register", async (req, res) => {
  try {
    const [events, registrations] = await Promise.all([
      readJsonList(EVENTS_JSON), readJsonList(REGISTRATIONS_JSON)
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const event = events.find(row => row.id === req.params.id && row.status === "published" && row.eventDate >= today);
    if (!event) return res.status(404).json({ ok: false, error: "This event is not open for registration." });
    const body = req.body || {};
    const fullName = String(body.fullName || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const phone = String(body.phone || "").trim();
    const attendeeCount = Number(body.attendeeCount || 1);
    if (!fullName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || phone.replace(/\D/g, "").length < 7 || !Number.isInteger(attendeeCount) || attendeeCount < 1) {
      return res.status(400).json({ ok: false, error: "Enter a name, valid email, phone number, and attendee count." });
    }
    if (registrations.some(row => row.eventId === event.id && row.email === email)) {
      return res.status(409).json({ ok: false, error: "This email is already registered for the event." });
    }
    const registeredCount = registrations.filter(row => row.eventId === event.id).reduce((total, row) => total + row.attendeeCount, 0);
    if (registeredCount + attendeeCount > event.capacity) {
      return res.status(409).json({ ok: false, error: "There are not enough places remaining for that registration." });
    }
    const registration = {
      id: crypto.randomUUID(), eventId: event.id, eventTitle: event.title, fullName, email, phone,
      attendeeCount, consentWhatsApp: body.consentWhatsApp === true,
      attendance: "registered", registeredAt: new Date().toISOString(), thankYouRequestedAt: ""
    };
    registrations.push(registration);
    await writeJsonList(REGISTRATIONS_JSON, registrations);
    const automation = await sendToN8n(process.env.N8N_REGISTRATION_WEBHOOK_URL, {
      type: "registration.created", event, registration
    });
    res.status(201).json({ ok: true, registrationId: registration.id, automation });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: "Could not save registration." });
  }
});

router.get("/api/admin/registrations", requireAdmin, async (req, res) => {
  const registrations = await readJsonList(REGISTRATIONS_JSON);
  const rows = req.query.eventId
    ? registrations.filter(row => row.eventId === req.query.eventId)
    : registrations;
  res.json(rows.sort((a, b) => b.registeredAt.localeCompare(a.registeredAt)));
});

router.patch("/api/admin/registrations/:id/attendance", requireAdmin, async (req, res) => {
  const registrations = await readJsonList(REGISTRATIONS_JSON);
  const registration = registrations.find(row => row.id === req.params.id);
  if (!registration) return res.status(404).json({ ok: false, error: "Registration not found." });
  registration.attendance = req.body?.attended === true ? "present" : "registered";
  await writeJsonList(REGISTRATIONS_JSON, registrations);
  const automation = await sendToN8n(process.env.N8N_REGISTRATION_WEBHOOK_URL, {
    type: "registration.attendance_updated", registration
  });
  res.json({ ok: true, registration, automation });
});

router.post("/api/admin/events/:id/thank-you", requireAdmin, async (req, res) => {
  const [events, registrations] = await Promise.all([
    readJsonList(EVENTS_JSON), readJsonList(REGISTRATIONS_JSON)
  ]);
  const event = events.find(row => row.id === req.params.id);
  if (!event) return res.status(404).json({ ok: false, error: "Event not found." });
  const eligible = registrations.filter(row => row.eventId === event.id && row.attendance === "present" && row.consentWhatsApp);
  if (!eligible.length) return res.status(400).json({ ok: false, error: "No present attendees have opted in to WhatsApp messages." });
  const recipients = eligible.filter(row => !row.thankYouRequestedAt);
  if (!recipients.length) return res.status(409).json({ ok: false, error: "Thank-you workflow has already been requested for these attendees." });
  const automation = await sendToN8n(process.env.N8N_THANK_YOU_WEBHOOK_URL, {
    type: "event.attendees.thank_you", event,
    recipients: recipients.map(({ id, fullName, phone, email }) => ({ id, fullName, phone, email, channel: "whatsapp" }))
  });
  if (!automation.delivered) return res.status(502).json({ ok: false, error: "The thank-you workflow is not configured or could not be reached." });
  const requestedAt = new Date().toISOString();
  for (const row of recipients) row.thankYouRequestedAt = requestedAt;
  await writeJsonList(REGISTRATIONS_JSON, registrations);
  res.json({ ok: true, recipientCount: recipients.length, requestedAt });
});

module.exports = router;
