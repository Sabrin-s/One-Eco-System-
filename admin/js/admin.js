const loginShell = document.getElementById("loginShell");
const adminShell = document.getElementById("adminShell");
const logoutBtn = document.getElementById("logoutBtn");
const loginStatus = document.getElementById("loginStatus");

function setLoggedIn(v) {
  loginShell.style.display = v ? "none" : "block";
  adminShell.style.display = v ? "block" : "none";
  logoutBtn.style.display = v ? "inline-block" : "none";
  if (v) {
    loadBookings();
    loadContacts();
    document.dispatchEvent(new Event("admin:ready"));
  }
}

document.getElementById("loginBtn").addEventListener("click", async () => {
  loginStatus.textContent = "Signing in…";
  try {
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: document.getElementById("adminEmail").value,
        password: document.getElementById("adminPass").value
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Sign-in failed.");
    loginStatus.textContent = "";
    setLoggedIn(true);
  } catch (error) {
    loginStatus.textContent = error.message;
  }
});
logoutBtn.addEventListener("click", async () => {
  await fetch("/api/admin/logout", { method: "POST" });
  setLoggedIn(false);
});

fetch("/api/admin/session").then(response => response.json()).then(session => {
  setLoggedIn(session.authenticated);
}).catch(() => setLoggedIn(false));

// ---- tabs ----
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.querySelector(`.tab-pane[data-pane="${btn.dataset.tab}"]`).classList.add("active");
    document.dispatchEvent(new CustomEvent("admin:tab", { detail: btn.dataset.tab }));
    if (btn.dataset.tab === "bookings") loadBookings();
    if (btn.dataset.tab === "contacts") loadContacts();
  });
});

// ---- visiting card OCR ----
const dropZone = document.getElementById("dropZone");
const cardInput = document.getElementById("cardInput");
const cardPreview = document.getElementById("cardPreview");
const ocrStatus = document.getElementById("ocrStatus");
const extractCard = document.getElementById("extractCard");
const extractForm = document.getElementById("extractForm");
const rawTextBox = document.getElementById("rawTextBox");

dropZone.addEventListener("click", () => cardInput.click());
["dragover", "dragleave", "drop"].forEach(evt => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.toggle("drag", evt === "dragover");
  });
});
dropZone.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];
  if (file) handleCardFile(file);
});
cardInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) handleCardFile(file);
});

// ---- AI pass: local open-source vision model (Ollama) re-reads the card ----
const aiStatus = document.getElementById("aiStatus");
let cardScan = 0;

function setAiNote(text, state) {
  aiStatus.hidden = !text;
  aiStatus.className = `ai-note ${state || ""}`;
  aiStatus.textContent = text || "";
}

// Map the registry field names the AI returns onto this simpler contact form.
function aiToContact(f) {
  const extras = [
    ["Tagline", f.tagline], ["Phone 2", f.phone_secondary], ["WhatsApp", f.whatsapp_number],
    ["Email 2", f.email_secondary], ["Website", f.website_url], ["Facebook", f.facebook_url],
    ["LinkedIn", f.linkedin_url], ["YouTube", f.youtube_url], ["Other", f.other_links]
  ].filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
  return {
    name: f.full_name, role: f.designation, company: f.business_name, email: f.email_primary,
    phone: f.phone_primary, instagram: f.instagram_url,
    address: [f.address, f.city && !(f.address || "").includes(f.city) ? f.city : ""].filter(Boolean).join(", "),
    other: extras.join("\n")
  };
}

async function runCardAi(file, scan) {
  const s = await CardAI.status();
  if (!s.available) { setAiNote(`AI check off — ${s.reason}`, "off"); return; }
  const started = Date.now();
  const tick = setInterval(() => {
    const expect = s.provider === "groq" ? "usually a few seconds" : "usually 1–3 minutes when the model runs on this PC";
    if (scan === cardScan) setAiNote(`🤖 AI (${s.model}) is reading the card… ${Math.round((Date.now() - started) / 1000)}s — ${expect}.`, "busy");
  }, 1000);
  setAiNote(`🤖 AI (${s.model}) is reading the card…`, "busy");
  try {
    const { fields, model, seconds } = await CardAI.extract(file);
    if (scan !== cardScan) return;
    const contact = aiToContact(fields);
    // The AI reading replaces the quick-scan guesses (including junk) except where you typed.
    Object.entries(contact).forEach(([k, v]) => {
      const el = extractForm[k];
      if (!el || el.dataset.userEdited) return;
      if (el.value !== (v || "")) {
        el.value = v || "";
        el.classList.remove("ai-filled"); void el.offsetWidth; el.classList.add("ai-filled");
      }
    });
    extractCard.style.display = "block";
    setAiNote(`✓ AI (${model}) read the card in ${seconds}s. Fields updated — please verify before saving.`, "done");
  } catch (err) {
    if (scan === cardScan) setAiNote(`AI check failed — ${err.message} The quick-scan fields are still editable.`, "off");
  } finally {
    clearInterval(tick);
  }
}

extractForm.addEventListener("input", (e) => {
  if (e.isTrusted && e.target.name) e.target.dataset.userEdited = "1";
});

function handleCardFile(file) {
  const scan = ++cardScan;
  extractForm.reset();
  extractForm.querySelectorAll("[data-user-edited]").forEach(el => delete el.dataset.userEdited);
  extractForm.querySelectorAll(".ai-filled").forEach(el => el.classList.remove("ai-filled"));
  cardPreview.src = URL.createObjectURL(file);
  cardPreview.style.display = "block";
  ocrStatus.textContent = "Reading card…";
  extractCard.style.display = "none";
  runCardAi(file, scan);
  quickScan(file, scan);
}

// Quick scan with the shared OCR (admin/js/card-ocr.js): straightens sideways
// photos, cleans up lighting, reads QR codes, then parses the registry fields.
async function quickScan(file, scan) {
  try {
    await cardPreview.decode().catch(() => {});
    const found = {};
    const qr = decodeQr(cardPreview);
    if (qr) Object.assign(found, parseVCard(qr));
    const best = await readUpright(cardPreview, (text) => {
      if (scan === cardScan) ocrStatus.textContent = text;
    });
    if (scan !== cardScan) return;
    if (best.rotation) cardPreview.src = best.canvas.toDataURL("image/jpeg", 0.9); // show it upright
    const text = best.data.text || "";
    const parsed = parseCardText(text, ocrLines(best.data));
    for (const [k, v] of Object.entries(parsed)) if (v && !found[k]) found[k] = v;
    const contact = aiToContact(CardAI.normalize(found));
    Object.entries(contact).forEach(([k, v]) => {
      const el = extractForm[k];
      // Don't overwrite an AI reading (or your own typing) with the quick scan.
      if (el && !el.classList.contains("ai-filled") && !el.dataset.userEdited) el.value = v || "";
    });
    ocrStatus.textContent = "Done — please verify the fields below.";
    const rawLabel = document.createElement("strong");
    rawLabel.textContent = "Raw OCR text:";
    rawTextBox.replaceChildren(rawLabel, document.createElement("br"), document.createTextNode(qr ? `QR: ${qr}\n\n${text}` : text));
    extractCard.style.display = "block";
  } catch (err) {
    if (scan === cardScan) ocrStatus.textContent = "Couldn't read the image — try a clearer photo.";
    console.error(err);
  }
}

document.getElementById("saveContactBtn").addEventListener("click", async () => {
  const fd = new FormData(extractForm);
  const payload = Object.fromEntries(fd.entries());
  payload.addedAt = new Date().toISOString();
  try {
    const res = await fetch("/api/admin/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("save failed");
    alert("Saved to contacts.csv");
    extractForm.reset();
    extractCard.style.display = "none";
    ocrStatus.textContent = "";
    cardPreview.style.display = "none";
    loadContacts();
  } catch (err) {
    alert("Couldn't reach the server — make sure the Node app is running (see README).");
  }
});

// ---- data tables ----
async function loadBookings() {
  const tbody = document.querySelector("#bookingsTable tbody");
  try {
    const res = await fetch("/api/bookings");
    if (!res.ok) throw new Error("Could not load bookings.");
    const rows = await res.json();
    tbody.replaceChildren();
    for (const booking of rows) {
      const row = document.createElement("tr");
      [booking.company, booking.fullName, booking.phone, booking.eventType, booking.eventDate, booking.budget,
        (booking.submittedAt || "").slice(0, 16).replace("T", " ")].forEach(value => {
        const cell = document.createElement("td");
        cell.textContent = value || "";
        row.appendChild(cell);
      });
      tbody.appendChild(row);
    }
    if (!rows.length) tbody.innerHTML = `<tr><td colspan="7">No bookings yet.</td></tr>`;
  } catch {
    tbody.innerHTML = `<tr><td colspan="7">Server not reachable. Start the Node app to see live data.</td></tr>`;
  }
}

async function loadContacts() {
  const tbody = document.querySelector("#contactsTable tbody");
  try {
    const res = await fetch("/api/contacts");
    if (!res.ok) throw new Error("Could not load contacts.");
    const rows = await res.json();
    tbody.replaceChildren();
    for (const contact of rows) {
      const row = document.createElement("tr");
      [contact.name, contact.role, contact.company, contact.email, contact.phone, contact.instagram].forEach(value => {
        const cell = document.createElement("td");
        cell.textContent = value || "";
        row.appendChild(cell);
      });
      tbody.appendChild(row);
    }
    if (!rows.length) tbody.innerHTML = `<tr><td colspan="6">No contacts yet.</td></tr>`;
  } catch {
    tbody.innerHTML = `<tr><td colspan="6">Server not reachable. Start the Node app to see live data.</td></tr>`;
  }
}

document.getElementById("refreshBookings")?.addEventListener("click", loadBookings);
document.getElementById("refreshContacts")?.addEventListener("click", loadContacts);

if (sessionStorage.getItem("oe_admin") === "1") { loadBookings(); loadContacts(); }
