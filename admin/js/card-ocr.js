// Shared visiting-card OCR: automatic orientation, lighting cleanup, QR/vCard
// decoding and field parsing. Used by the Admin scanner (admin.js) and the
// Card Scrape page (card-scrape.js). Needs Tesseract.js (and jsQR for QR codes).
// ---- OCR with automatic orientation ----
// Phone photos of cards are often sideways. We OCR the likely orientations
// and keep the one that reads best (confidence plus email/phone hits).
let ocrWorker = null;
let ocrProgress = () => {}; // set per scan by readUpright(img, onProgress)
let ocrStage = "Reading card";
async function getWorker() {
  if (!ocrWorker) {
    ocrWorker = await Tesseract.createWorker("eng", 1, {
      logger: (m) => { if (m.status === "recognizing text") ocrProgress(`${ocrStage}… ${Math.round(m.progress * 100)}%`); }
    });
    // Sparse-text mode: cards are scattered blocks in columns, not paragraphs.
    // It read every field on the test card where the default layout mode merged columns.
    await ocrWorker.setParameters({ tessedit_pageseg_mode: "11" });
  }
  return ocrWorker;
}

// Draws the image rotated, scaled so the long side is ~2000px, in grayscale,
// then flattens the lighting: each pixel is divided by a heavily blurred copy,
// which removes shadows and gradients from phone photos. Tested on a sideways,
// dim card photo where plain OCR returned garbage.
function prepareCanvas(img, rotation) {
  const w = img.naturalWidth, h = img.naturalHeight;
  const scale = Math.min(3, 2000 / Math.max(w, h));
  const sw = Math.round(w * scale), sh = Math.round(h * scale);
  const swap = rotation % 180 !== 0;
  const canvas = document.createElement("canvas");
  canvas.width = swap ? sh : sw;
  canvas.height = swap ? sw : sh;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(img, -sw / 2, -sh / 2, sw, sh);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const W = canvas.width, H = canvas.height;
  const px = ctx.getImageData(0, 0, W, H);
  const d = px.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  ctx.putImageData(px, 0, 0);

  // Background estimate: shrink to ~1/40 and scale back up (a cheap, wide blur
  // that works in every browser, unlike ctx.filter).
  const small = document.createElement("canvas");
  small.width = Math.max(1, Math.round(W / 40));
  small.height = Math.max(1, Math.round(H / 40));
  const sctx = small.getContext("2d");
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(canvas, 0, 0, small.width, small.height);
  const bg = document.createElement("canvas");
  bg.width = W; bg.height = H;
  const bctx = bg.getContext("2d", { willReadFrequently: true });
  bctx.imageSmoothingQuality = "high";
  bctx.drawImage(small, 0, 0, W, H);
  const b = bctx.getImageData(0, 0, W, H).data;

  for (let i = 0; i < d.length; i += 4) {
    const v = Math.min(255, (d[i] / (b[i] + 1)) * 235);
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(px, 0, 0);
  return canvas;
}

function readScore(data) {
  const text = data.text || "";
  let score = data.confidence || 0;
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text)) score += 15;
  if (/\d[\d\s-]{8,}\d/.test(text)) score += 15;
  return score;
}

// onProgress(text, percent) receives status updates while the card is read.
async function readUpright(img, onProgress = () => {}) {
  ocrProgress = (text) => onProgress(text);
  const setStatus = onProgress;
  const portrait = img.naturalHeight > img.naturalWidth * 1.15;
  // Cards are landscape, so a portrait photo is almost always rotated.
  const order = portrait ? [90, 270, 0, 180] : [0, 180, 90, 270];
  const worker = await getWorker();
  let best = null;
  for (let i = 0; i < order.length; i++) {
    const rotation = order[i];
    ocrStage = i === 0 ? "Reading card" : "Trying another orientation";
    setStatus(`${ocrStage}…`, 15 + i * 20);
    const canvas = prepareCanvas(img, rotation);
    const { data } = await worker.recognize(canvas);
    const score = readScore(data);
    if (!best || score > best.score) best = { rotation, canvas, data, score };
    // Stop early once a reading is clearly good; always compare both
    // sideways options for portrait photos since they look alike.
    if (best.score >= 85 && !(portrait && i === 0)) break;
  }
  return best;
}

// Lines with their pixel height, so the biggest printed text can be preferred for the name.
function ocrLines(data) {
  const lines = data.lines || (data.blocks || []).flatMap(b => (b.paragraphs || []).flatMap(p => p.lines || []));
  return lines.map(l => ({ text: (l.text || "").trim(), h: l.bbox ? l.bbox.y1 - l.bbox.y0 : 0 })).filter(l => l.text);
}

function decodeQr(img) {
  if (typeof jsQR !== "function") return "";
  try {
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(data.data, data.width, data.height)?.data || "";
  } catch {
    return "";
  }
}

function parseVCard(text) {
  const out = {};
  if (/^https?:\/\//i.test(text.trim())) {
    out.website_url = text.trim();
    return out;
  }
  if (!/BEGIN:VCARD/i.test(text)) return out;
  // vCards are newline separated; some printed cards use ';' between properties.
  const lines = text.split(/\r?\n|;(?=[A-Z-]+[:;])/);
  const tels = [], emails = [], urls = [];
  lines.forEach(line => {
    const [rawKey, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    const key = (rawKey || "").split(";")[0].toUpperCase();
    if (!value) return;
    if (key === "FN") out.full_name = value;
    else if (key === "N" && !out.full_name) out.full_name = value.split(";").filter(Boolean).reverse().join(" ");
    else if (key === "TITLE") out.designation = value;
    else if (key === "ORG") out.business_name = value.replace(/;/g, " ").trim();
    else if (key === "TEL") tels.push(value);
    else if (key === "EMAIL") emails.push(value);
    else if (key === "URL") urls.push(value);
    else if (key === "ADR") out.address = value.split(";").filter(Boolean).join(", ");
  });
  if (tels[0]) out.phone_primary = tels[0];
  if (tels[1]) out.phone_secondary = tels[1];
  if (emails[0]) out.email_primary = emails[0];
  if (emails[1]) out.email_secondary = emails[1];
  urls.forEach(u => Object.assign(out, classifyLink(u, out)));
  return out;
}

function classifyLink(url, existing = {}) {
  const u = url.toLowerCase();
  if (u.includes("instagram.com")) return { instagram_url: url };
  if (u.includes("linkedin.com")) return { linkedin_url: url };
  if (u.includes("facebook.com") || u.includes("fb.com")) return { facebook_url: url };
  if (u.includes("youtube.com") || u.includes("youtu.be")) return { youtube_url: url };
  if (!existing.website_url) return { website_url: url };
  return { other_links: [existing.other_links, url].filter(Boolean).join(" | ") };
}

const CITIES = ["Mumbai", "Delhi", "New Delhi", "Bengaluru", "Bangalore", "Hyderabad", "Ahmedabad", "Chennai", "Kolkata", "Pune",
  "Jaipur", "Surat", "Lucknow", "Kochi", "Cochin", "Goa", "Udaipur", "Chandigarh", "Indore", "Vadodara", "Gurugram", "Gurgaon",
  "Noida", "Thane", "Navi Mumbai", "Nagpur", "Coimbatore", "Mysuru", "Thiruvananthapuram", "Bhopal", "Rajkot", "Amritsar",
  "Dubai", "Abu Dhabi", "Bangkok", "Phuket", "Athens", "Singapore", "London"];

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}/g;
const FREE_MAIL = /^(gmail|yahoo|hotmail|outlook|live|icloud|rediffmail|ymail|aol|proton|protonmail)\./i;
// Labels printed on cards that are never a name, business or tagline.
const LABEL_LINE = /^(connect|follow|contact|call|reach|find|visit|email|e-mail|mail|phone|mob(ile)?|tel|cell|website|web|social|address|get in touch)\b[\s\w:]{0,12}$/i;

function titleCase(s) {
  // Only fix text printed in ALL CAPS; leave deliberate casing (e.g. "McKenzie") alone.
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

// Strips OCR junk from icon glyphs (phone/mail/instagram icons often read as
// ©, ®, (, @, etc.) at the start of a line.
function cleanLine(l) {
  return l.replace(/[|]/g, "").replace(/^[^A-Za-z0-9@+(]+/, "").replace(/^[©®@(]{1,2}\s+(?=\S)/, "").trim();
}

function parseCardText(raw, ocrLineInfo = []) {
  // OCR sometimes joins two card columns on one line with a "|" or wide gap — split them.
  const lines = raw.split("\n").flatMap(l => l.split(/\s+\|\s+|\s{3,}/)).map(cleanLine).filter(l => l.length > 1);
  const joined = lines.join(" ");
  const out = {};

  const emails = [...new Set(joined.match(EMAIL_RE) || [])];
  out.email_primary = emails[0] || "";
  out.email_secondary = emails[1] || "";

  const phones = [...new Set((joined.match(/(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,5}\)?[\s.-]?)?\d{3,5}[\s.-]?\d{3,5}/g) || [])
    .map(p => p.trim()).filter(p => { const n = p.replace(/\D/g, "").length; return n >= 10 && n <= 13; }))];
  out.phone_primary = phones[0] || "";
  out.phone_secondary = phones[1] || "";
  const waLine = lines.find(l => /whats\s?app|wa\.me/i.test(l));
  if (waLine) {
    const wa = waLine.match(/\+?\d[\d\s-]{8,14}\d/);
    if (wa) out.whatsapp_number = wa[0];
  }

  const noEmail = joined.replace(EMAIL_RE, " ");
  const links = noEmail.match(/\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|in|co\.in|net|org|global|ai|co|events|studio|io)(?:\/[^\s]*)?/gi) || [];
  links.forEach(l => {
    const next = classifyLink(l, out);
    Object.entries(next).forEach(([k, v]) => { if (!out[k] || k === "other_links") out[k] = v; });
  });

  // Social handles: use any platform hint on the line, otherwise the usual
  // card order — Instagram first, then Facebook.
  lines.forEach(line => {
    const lineNoEmail = line.replace(EMAIL_RE, " ");
    const m = lineNoEmail.match(/(?<![\w.])@([a-zA-Z0-9._]{3,40})/);
    if (!m) return;
    const handle = m[1].replace(/\.$/, "");
    const hint = lineNoEmail.slice(0, m.index).toLowerCase();
    if (/facebook|\bfb\b|^\s*f\b/.test(hint) && !out.facebook_url) out.facebook_url = `facebook.com/${handle}`;
    else if (/youtube|\byt\b/.test(hint) && !out.youtube_url) out.youtube_url = `youtube.com/@${handle}`;
    else if (/linkedin|\bin\b/.test(hint) && !out.linkedin_url) out.linkedin_url = `linkedin.com/in/${handle}`;
    else if (!out.instagram_url) out.instagram_url = `@${handle}`;
    else if (!out.facebook_url) out.facebook_url = `facebook.com/${handle}`;
    else out.other_links = [out.other_links, `@${handle}`].filter(Boolean).join(" | ");
  });

  const roleWords = /\b(founder|co-founder|director|manager|consultant|head|ceo|coo|cfo|cto|owner|proprietor|partner|executive|designer|planner|lead|president|chef|photographer|curator|coordinator|md|vp)\b/i;
  const addressWords = /\b(road|rd\.?|street|st\.|nagar|floor|sector|colony|plot|lane|marg|chowk|complex|plaza|tower|building|bldg|near|opp\.?|midc|phase|block|unit|shop|ave|avenue)\b|\b\d{6}\b/i;
  const isContactish = (l) => /@|www\.|https?:|\.com|\.in\b/i.test(l) || l.replace(/\D/g, "").length >= 7;

  const addressLines = lines.filter(l => addressWords.test(l) && !isContactish(l.replace(/\b\d{6}\b/, "")));
  out.address = addressLines.join(", ");
  const cityHit = CITIES.find(c => new RegExp(`\\b${c}\\b`, "i").test(joined));
  out.city = cityHit === "Cochin" ? "Kochi" : cityHit === "Bangalore" ? "Bengaluru" : cityHit === "Gurgaon" ? "Gurugram" : (cityHit || "");

  // OCR of card edges/shadows yields junk like "Rrr Reoiiiii——=__—=,~=>": require
  // mostly letters, no long symbol runs, and no letter repeated 4+ times.
  const isWordy = (l) => {
    const chars = l.replace(/\s/g, "");
    const letters = (chars.match(/[A-Za-z]/g) || []).length;
    return chars.length > 0 && letters / chars.length >= 0.8 && !/[^\w\s&.,'’()-]{2,}/.test(l) && !/([a-z])\1{3,}/i.test(l);
  };
  const candidates = lines.filter(l => !isContactish(l) && !addressLines.includes(l) && !LABEL_LINE.test(l) && /[a-z]{2}/i.test(l) && isWordy(l));
  const designation = candidates.find(l => roleWords.test(l) && l.split(/\s+/).length <= 5) || "";
  out.designation = titleCase(designation);

  // Name: 2–4 alphabetic words. Prefer the tallest printed line when OCR gives sizes.
  const nameLike = (l) => /^[A-Za-z.' -]{3,40}$/.test(l) && l.split(/\s+/).length >= 2 && l.split(/\s+/).length <= 4 && !roleWords.test(l);
  const heightOf = (l) => (ocrLineInfo.find(x => cleanLine(x.text) === l) || {}).h || 0;
  const names = candidates.filter(nameLike);
  const nameLine = names.sort((a, b) => heightOf(b) - heightOf(a))[0] || "";
  out.full_name = titleCase(nameLine);

  const rest = candidates.filter(l => l !== nameLine && l !== designation);
  const bizWords = /\b(events?|caterers?|catering|decor|décor|studios?|productions?|pvt|ltd|llp|hotels?|resorts?|travels?|tours|design(ers)?|entertainment|creations|weddings?|group|co\.?)\b/i;
  const bizLine = rest.find(l => bizWords.test(l)) || rest.find(l => l === l.toUpperCase() && l.length > 3) || "";
  out.business_name = titleCase(bizLine);
  if (!out.business_name && out.email_primary) {
    // A company domain usually is the business name: rajesh@coastlinecaterers.in → Coastlinecaterers
    const domain = out.email_primary.split("@")[1] || "";
    if (!FREE_MAIL.test(domain)) out.business_name = titleCase(domain.split(".")[0].toUpperCase());
  }
  out.tagline = titleCase(rest.find(l => l !== bizLine && (/&|since|and\b/i.test(l) || l.split(/\s+/).length >= 3)) || "");

  return out;
}
