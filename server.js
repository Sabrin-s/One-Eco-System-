require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createObjectCsvWriter } = require("csv-writer");
const csv = require("csv-parser");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({
  verify(req, res, buffer) {
    req.rawBody = Buffer.from(buffer);
  }
}));
app.use(express.static(path.join(__dirname, "public")));

const DATA_DIR = path.join(__dirname, "data");
const BOOKINGS_CSV = path.join(DATA_DIR, "bookings.csv");
const CONTACTS_CSV = path.join(DATA_DIR, "contacts.csv");
const EVENTS_JSON = path.join(DATA_DIR, "events.json");
const REGISTRATIONS_JSON = path.join(DATA_DIR, "registrations.json");
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || crypto.randomBytes(32).toString("hex");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------
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

function ensureCsv(filePath, header) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, header.map(h => h.title).join(",") + "\n");
  }
  return Promise.resolve();
}

function appendRow(filePath, header, row) {
  const csvWriter = createObjectCsvWriter({ path: filePath, header, append: true });
  return csvWriter.writeRecords([row]);
}

function readCsvAsJson(filePath) {
  return new Promise((resolve) => {
    if (!fs.existsSync(filePath)) return resolve([]);
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (d) => {
        const hasValue = Object.values(d).some(v => (v || "").toString().trim() !== "");
        if (hasValue) rows.push(d);
      })
      .on("end", () => resolve(rows))
      .on("error", () => resolve([]));
  });
}

// normalize CSV header names (Title Case) back to camelCase keys used by the frontend
function normalizeBookingRow(r) {
  return {
    company: r.Company, companySlug: r.CompanySlug, fullName: r.FullName, phone: r.Phone,
    email: r.Email, eventType: r.EventType, eventDate: r.EventDate, guestCount: r.GuestCount,
    city: r.City, budget: r.Budget, message: r.Message, submittedAt: r.SubmittedAt
  };
}
function normalizeContactRow(r) {
  return {
    name: r.Name, role: r.Role, company: r.Company, email: r.Email, phone: r.Phone,
    instagram: r.Instagram, address: r.Address, other: r.Other, addedAt: r.AddedAt
  };
}

async function readJsonList(filePath) {
  try {
    const value = JSON.parse(await fs.promises.readFile(filePath, "utf8"));
    return Array.isArray(value) ? value : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeJsonList(filePath, value) {
  const temporaryPath = `${filePath}.tmp`;
  await fs.promises.writeFile(temporaryPath, JSON.stringify(value, null, 2));
  await fs.promises.rename(temporaryPath, filePath);
}

function safeEqual(left, right) {
  const leftHash = crypto.createHash("sha256").update(String(left)).digest();
  const rightHash = crypto.createHash("sha256").update(String(right)).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

function signSession(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

app.use((req, res, next) => {
  const token = (req.headers.cookie || "").match(/(?:^|;\s*)oe_session=([^;]+)/)?.[1];
  if (token) {
    const [encoded, signature] = token.split(".");
    const expected = crypto.createHmac("sha256", SESSION_SECRET).update(encoded || "").digest("base64url");
    if (signature && safeEqual(signature, expected)) {
      try {
        const session = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
        if (session.role === "admin" && session.expiresAt > Date.now()) req.user = session;
      } catch { /* Ignore malformed session cookies. */ }
    }
  }
  next();
});

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(401).json({ ok: false, error: "Admin sign-in required." });
  next();
}

function verifyMetaSignature(req, res, next) {
  const secret = process.env.META_APP_SECRET;
  const signature = req.get("x-hub-signature-256") || "";
  if (!secret) return res.status(503).json({ ok: false, error: "Meta webhook signature verification is not configured." });
  if (!/^sha256=[a-f0-9]{64}$/i.test(signature)) return res.sendStatus(401);
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(req.rawBody || Buffer.alloc(0)).digest("hex")}`;
  if (!safeEqual(signature, expected)) return res.sendStatus(401);
  next();
}

async function sendToN8n(webhookUrl, event) {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!webhookUrl || !secret) return { configured: false, delivered: false };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ ...event, sentAt: new Date().toISOString() }),
      signal: controller.signal
    });
    return { configured: true, delivered: response.ok };
  } catch (error) {
    console.error("n8n workflow delivery failed:", error.message);
    return { configured: true, delivered: false };
  } finally {
    clearTimeout(timeout);
  }
}

app.post("/api/admin/login", (req, res) => {
  const email = (req.body?.email || "").trim().toLowerCase();
  const password = req.body?.password || "";
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD || !process.env.ADMIN_SESSION_SECRET) {
    return res.status(503).json({ ok: false, error: "Admin credentials are not configured on the server." });
  }
  if (!safeEqual(email, process.env.ADMIN_EMAIL.trim().toLowerCase()) || !safeEqual(password, process.env.ADMIN_PASSWORD)) {
    return res.status(401).json({ ok: false, error: "Email or password is incorrect." });
  }
  const value = signSession({ role: "admin", email, expiresAt: Date.now() + 8 * 60 * 60 * 1000 });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `oe_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${secure}`);
  res.json({ ok: true, user: { role: "admin", email } });
});

app.get("/api/admin/session", (req, res) => {
  res.json({ authenticated: req.user?.role === "admin", user: req.user ? { role: req.user.role, email: req.user.email } : null });
});

app.post("/api/admin/logout", (req, res) => {
  res.setHeader("Set-Cookie", "oe_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
  res.json({ ok: true });
});

// ---------------------------------------------------------------
// Booking endpoints
// ---------------------------------------------------------------
app.post("/api/booking", async (req, res) => {
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

app.get("/api/bookings", requireAdmin, async (req, res) => {
  const rows = await readCsvAsJson(BOOKINGS_CSV);
  res.json(rows.map(normalizeBookingRow).reverse());
});

app.get("/api/bookings.csv", requireAdmin, (req, res) => {
  if (!fs.existsSync(BOOKINGS_CSV)) return res.status(404).send("No bookings yet.");
  res.download(BOOKINGS_CSV, "bookings.csv");
});

// ---------------------------------------------------------------
// Admin: visiting-card contact endpoints
// ---------------------------------------------------------------
app.post("/api/admin/contact", requireAdmin, async (req, res) => {
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

app.get("/api/contacts", async (req, res) => {
  if (!req.user) return res.status(401).json({ ok: false, error: "Admin sign-in required." });
  const rows = await readCsvAsJson(CONTACTS_CSV);
  res.json(rows.map(normalizeContactRow).reverse());
});

app.get("/api/contacts.csv", requireAdmin, (req, res) => {
  if (!fs.existsSync(CONTACTS_CSV)) return res.status(404).send("No contacts yet.");
  res.download(CONTACTS_CSV, "contacts.csv");
});

// ---------------------------------------------------------------
// Admin: Partner Registry card-scrape records (38 fields, same column order
// as the "Card Scrape Template" tab of Partner_Registry_Fields.xlsx)
// ---------------------------------------------------------------
const CARD_SCRAPE_CSV = path.join(DATA_DIR, "card-scrape.csv");
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

function toE164(value) {
  const digits = String(value || "").replace(/[^\d+]/g, "");
  if (!digits) return "";
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return digits;
}

function withScheme(value) {
  const v = String(value || "").trim();
  if (!v) return "";
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

function istTimestamp(date = new Date()) {
  const ist = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 19) + "+05:30";
}

app.post("/api/admin/card-scrape", requireAdmin, async (req, res) => {
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

app.get("/api/admin/card-scrape", requireAdmin, async (req, res) => {
  const rows = await readCsvAsJson(CARD_SCRAPE_CSV);
  res.json(rows.reverse());
});

app.get("/api/admin/card-scrape.csv", requireAdmin, (req, res) => {
  if (!fs.existsSync(CARD_SCRAPE_CSV)) return res.status(404).send("No card records yet.");
  res.download(CARD_SCRAPE_CSV, "card-scrape.csv");
});

// ---------------------------------------------------------------
// Public events and attendee registration
// ---------------------------------------------------------------
app.get("/api/events", async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const events = await readJsonList(EVENTS_JSON);
    res.json(events.filter(event => event.status === "published" && event.eventDate >= today));
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: "Could not load events." });
  }
});

app.get("/api/admin/events", requireAdmin, async (req, res) => {
  const [events, registrations] = await Promise.all([
    readJsonList(EVENTS_JSON), readJsonList(REGISTRATIONS_JSON)
  ]);
  res.json(events.map(event => ({
    ...event,
    registeredCount: registrations.filter(row => row.eventId === event.id).reduce((total, row) => total + row.attendeeCount, 0)
  })).sort((a, b) => a.eventDate.localeCompare(b.eventDate)));
});

app.post("/api/admin/events", requireAdmin, async (req, res) => {
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

app.patch("/api/admin/events/:id", requireAdmin, async (req, res) => {
  const events = await readJsonList(EVENTS_JSON);
  const event = events.find(row => row.id === req.params.id);
  if (!event) return res.status(404).json({ ok: false, error: "Event not found." });
  const body = req.body || {};
  if (body.status === "published" || body.status === "draft") event.status = body.status;
  if (typeof body.title === "string" && body.title.trim()) event.title = body.title.trim();
  await writeJsonList(EVENTS_JSON, events);
  res.json({ ok: true, event });
});

app.post("/api/events/:id/register", async (req, res) => {
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

app.get("/api/admin/registrations", requireAdmin, async (req, res) => {
  const registrations = await readJsonList(REGISTRATIONS_JSON);
  const rows = req.query.eventId
    ? registrations.filter(row => row.eventId === req.query.eventId)
    : registrations;
  res.json(rows.sort((a, b) => b.registeredAt.localeCompare(a.registeredAt)));
});

app.patch("/api/admin/registrations/:id/attendance", requireAdmin, async (req, res) => {
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

app.post("/api/admin/events/:id/thank-you", requireAdmin, async (req, res) => {
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

app.get("/api/admin/integrations", requireAdmin, (req, res) => {
  res.json({
    registrations: Boolean(process.env.N8N_REGISTRATION_WEBHOOK_URL && process.env.N8N_WEBHOOK_SECRET),
    contacts: Boolean(process.env.N8N_CONTACT_WEBHOOK_URL && process.env.N8N_WEBHOOK_SECRET),
    thankYou: Boolean(process.env.N8N_THANK_YOU_WEBHOOK_URL && process.env.N8N_WEBHOOK_SECRET),
    inboundMessages: Boolean(process.env.N8N_INBOUND_WEBHOOK_URL && process.env.N8N_WEBHOOK_SECRET),
    secret: Boolean(process.env.N8N_WEBHOOK_SECRET)
  });
});

// ---------------------------------------------------------------
// Shared FAQ auto-reply rules (mirrors public/js/chatbot.js)
// ---------------------------------------------------------------
const FAQ_RULES = [
  { keywords: ["price", "pricing", "cost", "budget", "how much", "rate"],
    answer: "Pricing depends on the company, guest count, city and date. Share those details and you'll get a costed quote back — nothing is charged until you confirm." },
  { keywords: ["available", "availability", "free on", "open date", "slot"],
    answer: "Availability is checked per company and city. Share your date and we'll confirm within one business day." },
  { keywords: ["book", "booking", "how do i book", "reserve", "enquire"],
    answer: "Head to our website, pick one of the five companies, and fill the short form (about 3 minutes). We'll follow up right here." },
  { keywords: ["service", "services", "what do you offer", "décor", "decor", "venue", "artist"],
    answer: "Across the network: hotel & travel booking (Mondee), corporate offsites & MICE (Miraee), venues/décor/experiences (Aarna), full-scope wedding décor & production (Silver Tree Events), and experience listings (Tabhi.ai)." },
  { keywords: ["date", "timing", "timings", "schedule", "when"],
    answer: "Most companies plan 4–12 weeks ahead for full production, though last-minute enquiries are welcome — tell us your date." },
  { keywords: ["contact", "talk to human", "call", "phone number", "speak to someone"],
    answer: "Of course — a person will pick this up. You can also call/WhatsApp +91 94278 36887." },
  { keywords: ["where", "location", "based", "city", "ahmedabad"],
    answer: "Silver Tree Events is based in Ahmedabad and works across India and on destination projects. The wider network operates across India, UAE, Thailand and Greece." }
];
const FALLBACK_REPLY = "Thanks for the message — I've noted it. For anything specific to your event, our team will follow up shortly.";

function autoReply(text) {
  const t = (text || "").toLowerCase();
  for (const rule of FAQ_RULES) {
    if (rule.keywords.some(k => t.includes(k))) return rule.answer;
  }
  return FALLBACK_REPLY;
}

// ---------------------------------------------------------------
// WhatsApp Cloud API webhook (Meta) — verify + auto-reply
// Requires: WHATSAPP_VERIFY_TOKEN, WHATSAPP_TOKEN, WHATSAPP_PHONE_ID in .env
// Point your Meta App's WhatsApp webhook at:  https://yourdomain.com/webhook/whatsapp
// ---------------------------------------------------------------
app.get("/webhook/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

app.post("/webhook/whatsapp", verifyMetaSignature, async (req, res) => {
  res.sendStatus(200); // ack immediately, Meta requires a fast 200
  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    const message = change?.messages?.[0];
    if (!message || message.is_echo) return;

    const from = message.from;
    const text = message.text?.body || "";
    if (process.env.N8N_INBOUND_WEBHOOK_URL && process.env.N8N_WEBHOOK_SECRET) {
      await sendToN8n(process.env.N8N_INBOUND_WEBHOOK_URL, {
        type: "message.inbound", platform: "whatsapp", senderId: from,
        messageId: message.id, text, phoneNumberId: change.metadata?.phone_number_id
      });
      return;
    }
    const reply = autoReply(text);

    if (process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID) {
      await fetch(`https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: from,
          text: { body: reply }
        })
      });
    } else {
      console.log(`[WhatsApp demo] Would reply to ${from}: "${reply}"`);
    }
  } catch (err) {
    console.error("WhatsApp webhook error:", err);
  }
});

// ---------------------------------------------------------------
// Instagram Messaging webhook (Meta Graph API) — verify + auto-reply
// Requires: INSTAGRAM_VERIFY_TOKEN, INSTAGRAM_TOKEN, INSTAGRAM_ACCOUNT_ID in .env
// Point your Meta App's Instagram webhook at: https://yourdomain.com/webhook/instagram
// ---------------------------------------------------------------
app.get("/webhook/instagram", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === process.env.INSTAGRAM_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

app.post("/webhook/instagram", verifyMetaSignature, async (req, res) => {
  res.sendStatus(200);
  try {
    const entry = req.body?.entry?.[0];
    const messaging = entry?.messaging?.[0];
    const senderId = messaging?.sender?.id;
    const text = messaging?.message?.text || "";
    if (!senderId || !text || messaging.message.is_echo) return;

    if (process.env.N8N_INBOUND_WEBHOOK_URL && process.env.N8N_WEBHOOK_SECRET) {
      await sendToN8n(process.env.N8N_INBOUND_WEBHOOK_URL, {
        type: "message.inbound", platform: "instagram", senderId,
        messageId: messaging.message.mid, text, accountId: entry.id
      });
      return;
    }

    const reply = autoReply(text);

    if (process.env.INSTAGRAM_TOKEN) {
      await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${process.env.INSTAGRAM_TOKEN}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: senderId },
          message: { text: reply }
        })
      });
    } else {
      console.log(`[Instagram demo] Would reply to ${senderId}: "${reply}"`);
    }
  } catch (err) {
    console.error("Instagram webhook error:", err);
  }
});

app.listen(PORT, () => {
  console.log(`One Ecosystem running at http://localhost:${PORT}`);
});
