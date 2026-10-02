// Card Scrape workspace. Field list mirrors the "Card Scrape Fields" tab of
// docs/reference/Partner_Registry_Fields.xlsx — keep the two in sync if the sheet changes.

const GROUPS = [
  { name: "Identity", icon: "👤", color: "#F2A66B", blurb: "Who they are and whether they make decisions." },
  { name: "Contact", icon: "☎", color: "#3FD0C9", blurb: "Every way to reach them, normalised for dialling." },
  { name: "Links", icon: "🔗", color: "#6FA8DC", blurb: "Web, social and the QR payload, which beats OCR outright." },
  { name: "Uploads", icon: "📁", color: "#B08CF2", blurb: "Drive links to the card, brochure, video and folder." },
  { name: "Brief", icon: "✦", color: "#F2C14E", blurb: "What they supply, where, and what's still unknown." },
  { name: "Event", icon: "📍", color: "#F06A6A", blurb: "Where you met and what they said, before you forget." },
  { name: "System", icon: "⚙", color: "#8E9CB0", blurb: "Set automatically. Everything starts as a draft." }
];

const FIELDS = [
  ["Identity", "full_name", "Name", "text", "Visiting card", "High", "Printed largest on almost every card."],
  ["Identity", "designation", "Designation", "text", "Visiting card", "High", "Director, Founder, Sales Head. Tells you if you are talking to a decision maker."],
  ["Identity", "business_name", "Business Name", "text", "Visiting card", "High", "Usually beside the logo."],
  ["Identity", "tagline", "Tagline", "text", "Visiting card", "Medium", "The strapline under the logo — often the best one-line description of what they do."],
  ["Contact", "phone_primary", "Phone 1", "phone", "Visiting card", "High", "Saved as E.164, e.g. +919876543210."],
  ["Contact", "phone_secondary", "Phone 2", "phone", "Visiting card", "Medium", "Cards often carry a mobile and a landline. Keep both."],
  ["Contact", "whatsapp_number", "WhatsApp", "phone", "Visiting card", "Low", "Only if marked with the icon. Otherwise assume Phone 1 and confirm."],
  ["Contact", "email_primary", "Email 1", "email", "Visiting card", "High", ""],
  ["Contact", "email_secondary", "Email 2", "email", "Visiting card", "Low", "Personal vs work, e.g. a gmail alongside a domain address."],
  ["Contact", "address", "Address", "longtext", "Visiting card", "Medium", "Often abbreviated and hard to geocode. Confirm on the call."],
  ["Contact", "city", "City", "text", "Visiting card", "High", "Parsed from the address line."],
  ["Links", "website_url", "Website", "url", "Visiting card", "High", "https:// is added on save."],
  ["Links", "instagram_url", "Instagram", "url", "Card or PDF", "Medium", "A @handle is fine — the URL is built from it."],
  ["Links", "linkedin_url", "LinkedIn", "url", "Card or PDF", "Medium", ""],
  ["Links", "facebook_url", "Facebook", "url", "Card or PDF", "Low", ""],
  ["Links", "youtube_url", "YouTube", "url", "Card or PDF", "Low", ""],
  ["Links", "google_maps_url", "Google Maps", "url", "Looked up", "Low", "Not on the card. Find it from business name plus city."],
  ["Links", "other_links", "Other Links", "longtext", "Card, PDF or video", "Low", "Pipe separated: Behance, WedMeGood, JustDial, TripAdvisor…"],
  ["Links", "qr_payload", "QR Code Contents", "longtext", "Visiting card", "High", "Decoded automatically when the photo shows a QR code."],
  ["Uploads", "visiting_card_url", "Visiting Card Photo", "url", "Uploaded", "-", "Drive link to the original card image."],
  ["Uploads", "profile_pdf_url", "Profile / Brochure PDF", "url", "Uploaded", "-", "Drive link, if shared."],
  ["Uploads", "intro_video_url", "Intro Video", "url", "Uploaded", "-", "Drive link, if shared."],
  ["Uploads", "drive_folder_url", "Drive Folder", "url", "Auto", "-", "Their folder. Everything above sits inside it."],
  ["Brief", "brief_summary", "Brief", "longtext", "Generated", "-", "2–3 sentences on who they are and what they supply."],
  ["Brief", "brief_services", "Services Identified", "longtext", "Generated", "-", "What they actually offer, pulled mostly from the PDF."],
  ["Brief", "brief_coverage", "Coverage Identified", "text", "Generated", "-", "Cities or regions mentioned in the PDF or video."],
  ["Brief", "brief_sources", "Sources Used", "multiselect", "Auto", "-", "Tells you how much to trust the brief."],
  ["Brief", "brief_open_questions", "Open Questions", "longtext", "Generated", "-", "What the brief could not determine — the agenda for the follow-up call."],
  ["Brief", "extraction_confidence", "Extraction Confidence", "select", "Auto", "-", "Low or failed routes to manual keying."],
  ["Event", "event_name", "Met At", "text", "You", "-", "Which meet, expo or association event."],
  ["Event", "met_on", "Met On", "date", "You", "-", "Defaults to today. Set it when keying a backlog."],
  ["Event", "conversation_notes", "Conversation Notes", "longtext", "You", "-", "What they actually said — makes the follow-up a continuation, not a cold call."],
  ["Event", "follow_up_priority", "Follow-up Priority", "priority", "You", "-", "Twenty cards from one meet are not twenty equal leads."],
  ["System", "entity_id", "Entity ID", "system", "Auto", "-", "E-000123. Never reused."],
  ["System", "captured_at", "Captured At", "system", "Auto", "-", "ISO 8601 with offset."],
  ["System", "captured_by", "Captured By", "system", "Auto", "-", "Staff email from your session."],
  ["System", "record_status", "Record Status", "system", "Auto", "-", "Always starts at draft."],
  ["System", "card_verified", "Card Details Verified", "system", "Staff", "-", "Tick the box at the bottom once checked."]
].map(([group, key, label, type, source, conf, notes]) => ({ group, key, label, type, source, conf, notes }));

const SOURCES = ["visiting_card", "profile_pdf", "intro_video", "website"];
const CONFIDENCE = ["", "high", "medium", "low", "failed"];
const SYSTEM_PLACEHOLDER = {
  entity_id: "Assigned on save", captured_at: "Set on save", captured_by: "Your admin email",
  record_status: "draft", card_verified: "From the checkbox below"
};
const FILLABLE = FIELDS.filter(f => f.type !== "system");

const $ = (id) => document.getElementById(id);
const form = $("scrapeForm");
const groupColor = (name) => GROUPS.find(g => g.name === name).color;
let signedIn = false;

// ---------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------
function renderGroupCards() {
  const grid = $("groupGrid");
  GROUPS.forEach((g, i) => {
    const fields = FIELDS.filter(f => f.group === g.name);
    const card = document.createElement("a");
    card.className = "g-card reveal" + (g.name === "Links" ? " wide" : "");
    card.href = `#fg-${g.name}`;
    card.style.setProperty("--c", g.color);
    card.style.transitionDelay = `${i * 70}ms`;
    card.innerHTML = `
      <div class="g-icon">${g.icon}</div>
      <h3>${g.name}</h3>
      <div class="g-count">${fields.length} fields</div>
      <p>${g.blurb}</p>
      <div class="g-keys"></div>`;
    const keys = card.querySelector(".g-keys");
    fields.forEach(f => {
      const code = document.createElement("code");
      code.textContent = f.key;
      keys.appendChild(code);
    });
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    });
    grid.appendChild(card);
  });
}

function fieldControl(f) {
  const id = `f_${f.key}`;
  switch (f.type) {
    case "longtext":
      return `<textarea id="${id}" name="${f.key}" rows="3"></textarea>`;
    case "phone":
      return `<input id="${id}" name="${f.key}" type="tel" inputmode="tel" placeholder="+91 98765 43210">`;
    case "email":
      return `<input id="${id}" name="${f.key}" type="email" placeholder="name@business.com">`;
    case "url":
      return `<input id="${id}" name="${f.key}" type="text" inputmode="url" placeholder="${f.key === "instagram_url" ? "@handle or URL" : "example.com"}">`;
    case "date":
      return `<input id="${id}" name="${f.key}" type="date">`;
    case "select":
      return `<select id="${id}" name="${f.key}">${CONFIDENCE.map(v => `<option value="${v}">${v || "— choose —"}</option>`).join("")}</select>`;
    case "multiselect":
      return `<div class="multi">${SOURCES.map(s => `<label><input type="checkbox" name="${f.key}" value="${s}"><span>${s.replace("_", " ")}</span></label>`).join("")}</div>`;
    case "priority":
      return `<div class="prio">${["hot", "warm", "cold"].map(p => `<label><input type="radio" name="${f.key}" value="${p}">${p}</label>`).join("")}</div>`;
    case "system":
      return `<input id="${id}" type="text" readonly placeholder="${SYSTEM_PLACEHOLDER[f.key]}">`;
    default:
      return `<input id="${id}" name="${f.key}" type="text">`;
  }
}

function renderForm() {
  const holder = $("formGroups");
  const nav = $("groupNav");
  GROUPS.forEach(g => {
    const fields = FIELDS.filter(f => f.group === g.name);
    const section = document.createElement("section");
    section.className = "f-group";
    section.id = `fg-${g.name}`;
    section.style.setProperty("--c", g.color);
    section.innerHTML = `
      <div class="f-group-head"><div class="g-icon">${g.icon}</div><h3>${g.name}</h3><span>${fields.length} fields</span></div>
      <div class="f-fields"></div>`;
    const grid = section.querySelector(".f-fields");
    fields.forEach(f => {
      const wrap = document.createElement("div");
      const wide = ["longtext", "multiselect", "priority"].includes(f.type);
      wrap.className = "f" + (wide ? " full" : "");
      wrap.dataset.key = f.key;
      const badge = f.conf !== "-" ? `<span class="conf ${f.conf}" title="OCR confidence">${f.conf}</span>`
        : `<span class="conf src" title="Source">${f.source}</span>`;
      wrap.innerHTML = `<label for="f_${f.key}">${f.label} <code>${f.key}</code>${badge}</label>${fieldControl(f)}${f.notes ? `<div class="hint"></div>` : ""}`;
      if (f.notes) wrap.querySelector(".hint").textContent = f.notes;
      grid.appendChild(wrap);
    });
    holder.appendChild(section);

    const link = document.createElement("a");
    link.href = `#fg-${g.name}`;
    link.dataset.group = g.name;
    link.style.setProperty("--c", g.color);
    link.innerHTML = `<span><i class="gn-dot"></i>${g.name}</span><small></small>`;
    nav.appendChild(link);
  });
  $("fillableCount").textContent = FILLABLE.length;
  form.met_on.value = new Date().toISOString().slice(0, 10);
  updateProgress();
}

// ---------------------------------------------------------------
// Progress ring + per-group counters
// ---------------------------------------------------------------
function isFilled(f) {
  if (f.type === "multiselect" || f.type === "priority") return !!form.querySelector(`[name="${f.key}"]:checked`);
  const el = form.elements[f.key];
  return !!(el && el.value && el.value.trim());
}

function updateProgress() {
  const filled = FILLABLE.filter(isFilled).length;
  $("filledCount").textContent = filled;
  $("ringFg").style.strokeDashoffset = 326.7 * (1 - filled / FILLABLE.length);
  document.querySelectorAll("#groupNav a").forEach(a => {
    const fields = FILLABLE.filter(f => f.group === a.dataset.group);
    const small = a.querySelector("small");
    if (!fields.length) { small.textContent = "auto"; return; }
    const n = fields.filter(isFilled).length;
    small.textContent = `${n}/${fields.length}`;
    a.classList.toggle("complete", n === fields.length);
  });
}
form.addEventListener("input", updateProgress);
form.addEventListener("change", updateProgress);

// highlight the nav entry for the group in view
const navObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (!e.isIntersecting) return;
    const name = e.target.id.replace("fg-", "");
    document.querySelectorAll("#groupNav a").forEach(a => a.classList.toggle("active", a.dataset.group === name));
  });
}, { rootMargin: "-40% 0px -55% 0px" });

// ---------------------------------------------------------------
// Card upload, QR decode and OCR
// ---------------------------------------------------------------
const drop = $("drop");
const fileInput = $("cardFile");

drop.addEventListener("click", () => fileInput.click());
drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); } });
["dragover", "dragleave", "drop"].forEach(evt => drop.addEventListener(evt, (e) => {
  e.preventDefault();
  drop.classList.toggle("drag", evt === "dragover");
}));
drop.addEventListener("drop", (e) => { const file = e.dataTransfer.files[0]; if (file) handleCard(file); });
fileInput.addEventListener("change", (e) => { const file = e.target.files[0]; if (file) handleCard(file); });

function setStatus(text, pct) {
  $("scanStatus").textContent = text;
  if (pct != null) $("scanBar").style.width = `${pct}%`;
}

let scanId = 0;

async function handleCard(file) {
  const thisScan = ++scanId;
  const img = $("cardImg");
  img.src = URL.createObjectURL(file);
  img.hidden = false;
  $("dropEmpty").hidden = true;
  drop.classList.add("scanning");
  setStatus("Looking for a QR code…", 5);
  // The AI model is slow on CPU, so start it now and let the instant OCR fill first.
  const aiRun = startAi(file, thisScan);

  const found = {};
  await img.decode().catch(() => {});

  const qr = decodeQr(img);
  if (qr) {
    found.qr_payload = qr;
    Object.assign(found, parseVCard(qr));
    setStatus("QR decoded — reading the printed text…", 15);
  }

  try {
    const best = await readUpright(img, setStatus);
    if (best.rotation) img.src = best.canvas.toDataURL("image/jpeg", 0.9); // show the straightened card
    $("rawText").textContent = best.data.text || "(no text found)";
    const ocr = parseCardText(best.data.text || "", ocrLines(best.data));
    // Structured QR data wins over OCR wherever both found a value.
    for (const [k, v] of Object.entries(ocr)) if (v && !found[k]) found[k] = v;
  } catch (err) {
    console.error(err);
    setStatus("Couldn't read the image — try a clearer, well-lit photo.", 0);
  }

  drop.classList.remove("scanning");
  const keys = Object.keys(found).filter(k => found[k]);
  const highHits = ["full_name", "business_name", "phone_primary", "email_primary"].filter(k => found[k]).length;
  found.extraction_confidence = keys.length === 0 ? "failed" : highHits >= 3 ? "high" : highHits >= 2 ? "medium" : "low";
  await fillFields(found);
  checkSource("visiting_card");
  setStatus(keys.length ? `Found ${keys.length} fields — verify each against the card.` : "Nothing readable found. Key the fields in by hand.", 100);
  updateProgress();
  await aiRun;
}

// ---- AI pass (local open-source vision model via Ollama) ----
function setAiStatus(text, state) {
  const el = $("aiStatus");
  el.hidden = !text;
  el.className = `ai-status ${state || ""}`;
  el.querySelector("span").textContent = text || "";
}

async function startAi(file, thisScan) {
  const s = await CardAI.status();
  if (!s.available) { setAiStatus(`AI check off — ${s.reason}`, "off"); return; }
  setAiStatus(`AI (${s.model}) is reading the card… ${s.provider === "groq" ? "usually a few seconds." : "this can take 1–3 minutes when the model runs on this PC."}`, "busy");
  const started = Date.now();
  const tick = setInterval(() => {
    if (thisScan === scanId) setAiStatus(`AI (${s.model}) is reading the card… ${Math.round((Date.now() - started) / 1000)}s`, "busy");
  }, 1000);
  try {
    const { fields, model, seconds } = await CardAI.extract(file);
    if (thisScan !== scanId) return; // a newer card was dropped meanwhile
    const changed = await applyAiFields(fields);
    setAiStatus(changed.length
      ? `AI (${model}, ${seconds}s) corrected ${changed.length} field${changed.length > 1 ? "s" : ""} — highlighted in purple. Please verify.`
      : `AI (${model}, ${seconds}s) agrees with the fields above.`, "done");
    const conf = form.elements.extraction_confidence;
    if (conf && !conf.dataset.userEdited) conf.value = fields.full_name && (fields.phone_primary || fields.email_primary) ? "high" : "medium";
  } catch (err) {
    if (thisScan === scanId) setAiStatus(`AI check failed — ${err.message} The OCR fields above are still usable.`, "off");
  } finally {
    clearInterval(tick);
  }
}

// Overwrite OCR guesses with the AI's reading, but never a field the person typed in.
async function applyAiFields(fields) {
  const changed = [];
  for (const f of FILLABLE) {
    const v = fields[f.key];
    const el = form.elements[f.key];
    if (!v || !el || el instanceof RadioNodeList || el.dataset.userEdited) continue;
    if (el.value.trim() === v) continue;
    el.value = v;
    const wrap = el.closest(".f");
    wrap.classList.remove("filled", "ai-filled");
    void wrap.offsetWidth;
    wrap.classList.add("ai-filled");
    changed.push(f.key);
    updateProgress();
    await sleep(90);
  }
  return changed;
}

form.addEventListener("input", (e) => {
  if (e.isTrusted && e.target.name) e.target.dataset.userEdited = "1";
});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fillFields(values) {
  for (const f of FILLABLE) {
    const v = values[f.key];
    if (!v || f.type === "multiselect" || f.type === "priority") continue;
    const el = form.elements[f.key];
    if (!el || el.value.trim()) continue; // never overwrite something typed by hand
    el.value = v;
    const wrap = el.closest(".f");
    wrap.classList.remove("filled");
    void wrap.offsetWidth;
    wrap.classList.add("filled");
    updateProgress();
    await sleep(90);
  }
}

function checkSource(value) {
  const box = form.querySelector(`[name="brief_sources"][value="${value}"]`);
  if (box) box.checked = true;
}

// ---------------------------------------------------------------
// Save
// ---------------------------------------------------------------
function toast(text, kind = "") {
  const t = $("toast");
  t.textContent = text;
  t.className = `toast show ${kind}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = "toast"; }, 3600);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!signedIn) { toast("Sign in on the Admin page to save records.", "err"); return; }
  const payload = {};
  FILLABLE.forEach(f => {
    if (f.type === "multiselect") payload[f.key] = [...form.querySelectorAll(`[name="${f.key}"]:checked`)].map(i => i.value).join("|");
    else if (f.type === "priority") payload[f.key] = form.querySelector(`[name="${f.key}"]:checked`)?.value || "";
    else payload[f.key] = form.elements[f.key]?.value || "";
  });
  payload.card_verified = form.card_verified.checked ? "true" : "false";

  const btn = $("saveBtn");
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    const res = await fetch("/api/admin/card-scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Save failed.");
    ["entity_id", "captured_at", "captured_by", "record_status"].forEach(k => { $(`f_${k}`).value = result.record[k]; });
    toast(`Saved ${result.record.entity_id} as draft.`, "ok");
    loadRecords(result.record.entity_id);
  } catch (err) {
    toast(err.message, "err");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save as draft";
  }
});

form.addEventListener("reset", () => {
  scanId++; // ignore any AI answer still on its way for the cleared card
  setTimeout(() => {
    form.querySelectorAll("[data-user-edited]").forEach(el => delete el.dataset.userEdited);
    form.querySelectorAll(".ai-filled").forEach(el => el.classList.remove("ai-filled"));
    setAiStatus("");
    form.met_on.value = new Date().toISOString().slice(0, 10);
    $("cardImg").hidden = true;
    $("dropEmpty").hidden = false;
    fileInput.value = "";
    $("rawText").textContent = "Nothing scanned yet.";
    setStatus("Waiting for a card.", 0);
    updateProgress();
  });
});

// ---------------------------------------------------------------
// Records table
// ---------------------------------------------------------------
async function loadRecords(highlightId) {
  const body = $("recordsBody");
  if (!signedIn) {
    body.innerHTML = `<tr><td colspan="7">Sign in on the <a href="/admin">Admin page</a> to see captured records.</td></tr>`;
    return;
  }
  try {
    const res = await fetch("/api/admin/card-scrape");
    if (!res.ok) throw new Error();
    const rows = await res.json();
    body.replaceChildren();
    rows.slice(0, 50).forEach(r => {
      const tr = document.createElement("tr");
      if (r.entity_id === highlightId) tr.className = "new";
      [r.entity_id, r.full_name, r.business_name, r.city, r.event_name].forEach(v => {
        const td = document.createElement("td");
        td.textContent = v || "—";
        tr.appendChild(td);
      });
      const prio = document.createElement("td");
      if (["hot", "warm", "cold"].includes(r.follow_up_priority)) prio.innerHTML = `<span class="badge ${r.follow_up_priority}">${r.follow_up_priority}</span>`;
      else prio.textContent = "—";
      const ver = document.createElement("td");
      ver.innerHTML = r.card_verified === "true" ? `<span class="badge yes">verified</span>` : `<span class="badge no">draft</span>`;
      tr.append(prio, ver);
      body.appendChild(tr);
    });
    if (!rows.length) body.innerHTML = `<tr><td colspan="7">No cards captured yet — scan the first one above.</td></tr>`;
  } catch {
    body.innerHTML = `<tr><td colspan="7">Server not reachable. Start the Node app to see live data.</td></tr>`;
  }
}
$("refreshRecords").addEventListener("click", () => loadRecords());

// ---------------------------------------------------------------
// Scroll reveal + hero counters
// ---------------------------------------------------------------
function animateCount(el) {
  const target = +el.dataset.count;
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / 1200);
    el.textContent = Math.round(target * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function setupReveal() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add("in");
      e.target.querySelectorAll?.("[data-count]").forEach(animateCount);
      io.unobserve(e.target);
    });
  }, { threshold: 0.12 });
  document.querySelectorAll(".reveal").forEach(el => io.observe(el));
  document.querySelectorAll(".f-group").forEach(el => navObserver.observe(el));
}

// ---------------------------------------------------------------
// Boot
// ---------------------------------------------------------------
renderGroupCards();
renderForm();
setupReveal();

fetch("/api/admin/session").then(r => r.json()).then(s => {
  signedIn = !!s.authenticated;
  const pill = $("sessionPill");
  if (signedIn) {
    pill.textContent = `● ${s.user.email}`;
    pill.classList.add("on");
  }
  $("signinNote").hidden = signedIn;
  loadRecords();
}).catch(() => {
  $("signinNote").hidden = false;
  loadRecords();
});
