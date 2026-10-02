const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..", "..");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const ADMIN_DIR = path.join(ROOT_DIR, "admin");
const DATA_DIR = path.join(ROOT_DIR, "data");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

module.exports = {
  ROOT_DIR,
  PUBLIC_DIR,
  ADMIN_DIR,
  DATA_DIR,
  BOOKINGS_CSV: path.join(DATA_DIR, "bookings.csv"),
  CONTACTS_CSV: path.join(DATA_DIR, "contacts.csv"),
  CARD_SCRAPE_CSV: path.join(DATA_DIR, "card-scrape.csv"),
  EVENTS_JSON: path.join(DATA_DIR, "events.json"),
  REGISTRATIONS_JSON: path.join(DATA_DIR, "registrations.json")
};
