// Shared FAQ auto-reply rules (mirrors public/js/chatbot.js)
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

module.exports = { autoReply };
