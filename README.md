# One Ecosystem — Event Coordinator Platform

A five-company event platform with a public event calendar and registration,
per-company booking enquiries, a server-authenticated admin panel,
visiting-card OCR, and n8n integration points for Google Sheets and Meta
messaging workflows.

## What's included and working out of the box

- **Home page** — hero, About (Mondee Tech / Tabhi.ai / Jalpa Rathod, from your
  deck), a live-voiced animated avatar greeter, five company "doors", and an
  FAQ accordion.
- **Booking flow** — a 3-step form per company (~3 minutes), saved to
  `data/bookings.csv` via the Node server, with a WhatsApp hand-off link on
  the confirmation screen.
- **Event registration** — admins create and publish events at `/admin`;
  attendees browse and register at `/events.html` without creating an account.
- **Event assistant** — floating chat widget on the home, booking, and events pages.
  It answers common questions with local keyword rules and can collect a
  booking enquiry, show a review summary, and submit it to the existing
  `/api/booking` endpoint after confirmation.
- **Admin panel** (`/admin`, kept off the public pages — see "Public and admin links" below) — credentials are verified by the server and
  admin APIs require an HTTP-only session cookie.
  - Create/publish events, review registrations, mark attendance, and trigger
    thank-you workflows for present attendees who opted in to WhatsApp.
  - Visiting-card scanner: drag & drop an image, OCR runs in the browser
    (Tesseract.js), extracted fields (name, email, phone, Instagram, address,
    role, other) are shown for verification, then saved to `data/contacts.csv`
    and optionally forwarded to n8n.
  - Bookings and Contacts tables, each with a "Download CSV" button.
- **WhatsApp / Instagram webhooks** — `/webhook/whatsapp` and
  `/webhook/instagram` receive Meta messages and forward them to n8n when
  configured. A local FAQ auto-reply remains as a development fallback.

## Run it

```bash
npm install
cp .env.example .env
npm start
```

Set a strong `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_SESSION_SECRET` in
`.env` before signing in. Then open `http://localhost:3000`.

The site also works if opened as static files (no server) — booking
submissions just won't be saved to CSV, and the admin data tables will show
"server not reachable."

## n8n and Google Sheets

The app sends four signed event types to configurable n8n webhooks:

- `registration.created` — append event registrations to a Registrations sheet.
- `registration.attendance_updated` — update attendance by registration ID.
- `contact.created` — append verified card-scan fields to a Contacts sheet.
- `message.inbound` — route incoming WhatsApp and Instagram questions to reply
  workflows.
- `event.attendees.thank_you` — request a thank-you for attendees marked
  present who explicitly opted in to WhatsApp messages.

Set the webhook URLs and `N8N_WEBHOOK_SECRET` in `.env`. See
[`docs/N8N_SETUP.md`](docs/N8N_SETUP.md) for workflow and Google sharing setup. Local
records remain saved if a workflow is not configured or cannot be reached.

## Event assistant structure

The website assistant is a deterministic conversation flow, not an LLM agent:

1. `public/index.html` and `public/booking.html` provide the shared chat widget.
2. `public/js/chatbot.js` handles FAQ keyword matching, booking-intent
  detection, and the intake state (`bookingDraft` and `bookingStep`). On a
  company booking page, it preselects that company; otherwise, it asks the
  visitor to choose one.
3. Before submission, the assistant displays the collected details and waits
  for an explicit yes/no response. A confirmed enquiry is sent to
  `POST /api/booking` using the same fields as the booking form.
4. `src/routes/bookings.js` appends the enquiry to `data/bookings.csv`; the admin bookings
  table reads it through `GET /api/bookings`.

The assistant does not check live availability, calculate quotes, or send
messages to customers. It also does not retain an unfinished conversation
after the page is closed. Those capabilities need separate integrations.

## Editing company details

All five companies (name, tagline, description, WhatsApp number, Instagram
handle, colour) live in one file: `public/js/companies.js`. Update the
`whatsapp` and `instagram` fields per company once you have their real
numbers/handles — right now they default to the number from the deck
(+91 94278 36887).

## Editing Home/About content

The Home and About sections were built from the One Ecosystem deck you
provided (Mondee Tech Private Limited, Tabhi.ai, Jalpa Rathod's background).
To update, edit the text directly in `public/index.html` — it's plain HTML,
no build step required.

## The avatar greeter

`public/js/avatar.js` uses the browser's built-in `SpeechSynthesis` API plus
an animated SVG — no external account or video file needed, and it works the
moment the page loads. If you'd rather use a rendered video (e.g. from
Synthesia, HeyGen, or D-ID), replace the `<svg id="avatarSvg">` block in
`index.html` with a `<video>` tag and point it at your exported file; the
play/replay/mute buttons already have hooks in `avatar.js` to control it.

## Known limitations of this prototype

- **Visiting-card OCR** uses generic heuristics (regex for email/phone/
  Instagram handle, keyword matching for job-title and address lines). It
  works well on clean, well-lit cards; messy layouts may need manual
  correction in the review step — which the UI already supports.
- **Admin login** uses an HMAC-signed HTTP-only session cookie and `.env`
  credentials. Add rate limiting and a persistent session store before a
  high-traffic production deployment.
- **CSV storage** is fine for a prototype/small volume. For production
  scale, migrate the CSV and JSON storage to a database.
- **Instagram outbound messaging** needs an eligible conversation and a
  recipient-scoped Instagram ID; a public username is not enough to send an
  unsolicited thank-you. Attendance thank-you requests currently include
  opted-in WhatsApp recipients only.
- **WhatsApp policy** may require an approved message template outside the
  customer-service window. Configure that in n8n before production.

## Public and admin links

One app serves both sides, so bookings and registrations made on the public
site appear in the admin panel straight away.

- **Public site:** `https://your-site/` (home, events, booking). It has no link to the admin area.
- **Admin:** `https://your-site/admin` (sign in) and `https://your-site/admin/card-scrape`.
  The old `/admin.html` and `/card-scrape.html` links redirect there.

To give admin its own domain, point a second domain (e.g. `admin.example.com`)
at the same app and set `ADMIN_HOST=admin.example.com` and
`PUBLIC_URL=https://www.example.com`. The admin area and admin APIs then only
answer on the admin domain (404 on the public one), and public pages opened
on the admin domain redirect to the public site.

## Project structure

```
event-coordinator/
├── package.json               npm start → node src/server.js
├── .env.example               Admin, n8n, and Meta configuration template
├── src/                       Express backend
│   ├── server.js              Entry point: loads .env, starts the server
│   ├── app.js                 Middleware + mounts every route module
│   ├── config/paths.js        Public/data folders and data file paths
│   ├── lib/
│   │   ├── csv-store.js       CSV read/append helpers
│   │   ├── json-store.js      JSON list read/write (atomic)
│   │   ├── n8n.js             Signed n8n webhook delivery
│   │   ├── format.js          E.164 phones, https:// URLs, IST timestamps
│   │   └── faq.js             FAQ auto-reply rules for WhatsApp/Instagram
│   ├── middleware/
│   │   ├── auth.js            Session cookie, requireAdmin
│   │   ├── meta-signature.js  Meta webhook signature check
│   │   └── site-split.js      Public vs admin links (/admin, or ADMIN_HOST)
│   └── routes/
│       ├── auth.js            /api/admin/login, session, logout
│       ├── bookings.js        /api/booking, /api/bookings
│       ├── contacts.js        /api/admin/contact, /api/contacts
│       ├── card-scrape.js     /api/admin/card-scrape (38 registry fields)
│       ├── card-ai.js         /api/admin/card-ai (local Ollama vision model)
│       ├── events.js          Events, registrations, attendance, thank-you
│       ├── integrations.js    /api/admin/integrations status
│       └── webhooks.js        /webhook/whatsapp, /webhook/instagram
├── public/                    Public site, served at "/"
│   ├── index.html             Home page with voiced portrait greeter
│   ├── events.html            Public event calendar and registration
│   ├── booking.html           Booking form (reads ?company= slug)
│   ├── assets/
│   │   ├── images/            jalpa-portrait.jpg
│   │   └── audio/             jalpa-intro.ogg
│   ├── css/style.css          Site styles (shared with admin)
│   └── js/
│       ├── companies.js       Single source of truth for the 5 companies (shared)
│       ├── avatar.js          Voice-note greeter with live waveform
│       ├── chatbot.js         FAQ and conversational booking widget
│       ├── events.js          Public event discovery and registration
│       ├── main.js            Home page rendering (doors + FAQ)
│       ├── motion.js          Scroll/hero animations
│       └── booking.js         Booking form logic
├── admin/                     Admin area, served at "/admin"
│   ├── index.html             /admin: events, attendees, bookings, contacts, card scan
│   ├── card-scrape.html       /admin/card-scrape: 38-field card scan + verify
│   ├── css/card-scrape.css
│   └── js/
│       ├── admin.js           Login, OCR + AI card scan, data tables
│       ├── events-admin.js    Event, roster, and attendance flows
│       ├── card-scrape.js     Card Scrape fields, QR/OCR parsing, save
│       └── card-ai.js         Browser helper for AI extraction
├── data/                      Runtime CSV/JSON records (git-ignored)
└── docs/
    ├── N8N_SETUP.md           Sheets and messaging workflow setup
    ├── reference/             Partner_Registry_Fields.xlsx (field spec)
    └── source-media/          Original photo/voice files, retired avatars
```
