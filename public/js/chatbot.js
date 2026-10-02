// Simple keyword-matched FAQ auto-responder.
// The exact same rule set (see src/lib/faq.js -> autoReply()) is reused by the
// WhatsApp and Instagram webhook handlers, so replies stay consistent
// across the website chat widget, WhatsApp and Instagram DMs.

const FAQ_RULES = [
  {
    id: "pricing",
    keywords: ["price", "pricing", "cost", "budget", "how much", "rate"],
    question: "What does it cost?",
    answer: "Pricing depends on the company, guest count, city and date. Share those details in the booking form and you'll get a costed quote back — nothing is charged until you confirm."
  },
  {
    id: "availability",
    keywords: ["available", "availability", "free on", "open date", "slot"],
    question: "Are you available on my date?",
    answer: "Availability is checked per company and city. Submit your date in the booking form and we'll confirm within one business day — or ask on WhatsApp for a same-day check."
  },
  {
    id: "booking",
    keywords: ["book", "booking", "how do i book", "reserve", "enquire"],
    question: "How do I make a booking?",
    answer: "Pick one of the five companies on the home page, fill the short form (about 3 minutes), and submit. You'll get an on-screen confirmation and we'll follow up on WhatsApp or email."
  },
  {
    id: "services",
    keywords: ["service", "services", "what do you offer", "what can you do", "décor", "decor", "venue", "artist"],
    question: "What services are offered?",
    answer: "Across the network: hotel & travel booking (Mondee), corporate offsites & MICE (Miraee), venues/décor/experiences (Aarna), full-scope wedding décor & production (Silver Tree Events), and experience listings (Tabhi.ai)."
  },
  {
    id: "dates",
    keywords: ["date", "timing", "timings", "schedule", "when"],
    question: "What dates and timings work?",
    answer: "Most companies plan 4–12 weeks ahead for full production, though last-minute enquiries are welcome — mention your date and we'll tell you what's realistic."
  },
  {
    id: "contact",
    keywords: ["contact", "talk to human", "call", "phone number", "speak to someone"],
    question: "Can I speak to a person?",
    answer: "Yes — tap the WhatsApp button (bottom right) any time, or reach us directly on +91 94278 36887 / jrathod@mondee.com."
  },
  {
    id: "location",
    keywords: ["where", "location", "based", "city", "ahmedabad"],
    question: "Where are you based?",
    answer: "Silver Tree Events is based in Ahmedabad and works across India and on destination projects. Mondee, Miraee, Aarna and Tabhi.ai operate across India, UAE, Thailand, Greece and beyond."
  }
];

const FALLBACK_REPLY = "Good question — I've noted it. For anything specific to your event, the fastest route is the booking form or a direct WhatsApp message, and a person will follow up.";

const BOOKING_QUESTIONS = [
  { key: "company", prompt: "Which company would you like to enquire with? Choose Tabhi.ai, Mondee, Miraee, Aarna, or Silver Tree Events." },
  { key: "fullName", prompt: "What's your full name?" },
  { key: "phone", prompt: "What's the best phone number to reach you on?" },
  { key: "email", prompt: "What's your email address?" },
  { key: "eventType", prompt: "What kind of event are you planning?" },
  { key: "eventDate", prompt: "What date do you have in mind? An approximate date is fine." },
  { key: "guestCount", prompt: "Roughly how many guests do you expect?" },
  { key: "city", prompt: "Which city will the event be in?" },
  { key: "budget", prompt: "What's your approximate budget? You can also type skip." },
  { key: "message", prompt: "Any other details we should know? You can also type skip." }
];

const pageCompany = typeof getCompanyBySlug === "function"
  ? getCompanyBySlug(new URLSearchParams(location.search).get("company"))
  : null;
let bookingDraft = null;
let bookingQuestions = BOOKING_QUESTIONS;
let bookingStep = 0;
let awaitingBookingConfirmation = false;

function autoReply(text) {
  const t = text.toLowerCase();
  for (const rule of FAQ_RULES) {
    if (rule.keywords.some(k => t.includes(k))) return rule.answer;
  }
  return FALLBACK_REPLY;
}

// ---- Chat widget wiring (home + booking pages) ----
(function () {
  const panel = document.getElementById("chatPanel");
  const body = document.getElementById("chatBody");
  const quick = document.getElementById("chatQuick");
  const form = document.getElementById("chatForm");
  const input = document.getElementById("chatInput");
  const openBtn = document.getElementById("openChat");
  const closeBtn = document.getElementById("closeChat");
  if (!panel) return;

  function addMsg(text, who) {
    const div = document.createElement("div");
    div.className = "msg " + who;
    div.textContent = text;
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
  }

  function renderQuick() {
    quick.innerHTML = "";
    FAQ_RULES.slice(0, 4).forEach(r => {
      const b = document.createElement("button");
      b.className = "qbtn";
      b.type = "button";
      b.textContent = r.question;
      b.addEventListener("click", () => handleUserText(r.question));
      quick.appendChild(b);
    });
    const bookingButton = document.createElement("button");
    bookingButton.className = "qbtn";
    bookingButton.type = "button";
    bookingButton.textContent = "Start a booking enquiry";
    bookingButton.addEventListener("click", () => handleUserText("Start a booking enquiry"));
    quick.appendChild(bookingButton);
  }

  function beginBooking() {
    awaitingBookingConfirmation = false;
    bookingDraft = {
      company: pageCompany?.name || "",
      companySlug: pageCompany?.slug || ""
    };
    quick.innerHTML = "";
    bookingQuestions = pageCompany
      ? BOOKING_QUESTIONS.filter(question => question.key !== "company")
      : BOOKING_QUESTIONS;
    bookingStep = 0;
    addMsg(pageCompany
      ? `Let's start an enquiry with ${pageCompany.name}. I'll ask a few questions, then show you the details before anything is submitted.`
      : "Let's start an enquiry. I'll ask a few questions, then show you the details before anything is submitted.", "bot");
    addMsg(bookingQuestions[bookingStep].prompt, "bot");
  }

  function companyFromAnswer(text) {
    const value = text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (value.length < 3) return null;
    return typeof COMPANIES === "undefined" ? null : COMPANIES.find(company => {
      const name = company.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const slug = company.slug.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      return value === name || value === slug || name.includes(value) || slug.includes(value);
    }) || null;
  }

  async function submitBooking() {
    const payload = { ...bookingDraft, submittedAt: new Date().toISOString() };
    try {
      const response = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error("Booking request failed");
      addMsg("Your enquiry has been sent. The team will follow up using the contact details you provided.", "bot");
    } catch (error) {
      addMsg("I couldn't send that just now. Your details haven't been submitted; please try the booking form or contact us on WhatsApp.", "bot");
    }
    bookingDraft = null;
    awaitingBookingConfirmation = false;
    renderQuick();
  }

  function handleBookingText(text) {
    const value = text.trim();
    const normalized = value.toLowerCase();
    if (["cancel", "stop", "start over", "restart"].includes(normalized)) {
      bookingDraft = null;
      awaitingBookingConfirmation = false;
      addMsg("No problem. The enquiry was cancelled and nothing was submitted.", "bot");
      renderQuick();
      return;
    }

    if (awaitingBookingConfirmation) {
      if (/^(yes|y|confirm|submit)$/i.test(value)) {
        addMsg("Sending your enquiry…", "bot");
        submitBooking();
      } else if (/^(no|n|edit|cancel)$/i.test(value)) {
        bookingDraft = null;
        awaitingBookingConfirmation = false;
        addMsg("No problem. Nothing was submitted. You can start again whenever you're ready.", "bot");
        renderQuick();
      } else {
        addMsg("Please reply yes to submit, or no to cancel.", "bot");
      }
      return;
    }

    const question = bookingQuestions[bookingStep];
    if (question.key === "company") {
      const company = companyFromAnswer(value);
      if (!company) {
        addMsg("I couldn't match that to a company. Please choose Tabhi.ai, Mondee, Miraee, Aarna, or Silver Tree Events.", "bot");
        return;
      }
      bookingDraft.company = company.name;
      bookingDraft.companySlug = company.slug;
    } else if ((question.key === "budget" || question.key === "message") && normalized === "skip") {
      bookingDraft[question.key] = "";
    } else if (question.key === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      addMsg("That email doesn't look complete. Please enter an address like name@example.com.", "bot");
      return;
    } else if (question.key === "phone" && value.replace(/\D/g, "").length < 7) {
      addMsg("Please enter a phone number with at least 7 digits, or type cancel to stop.", "bot");
      return;
    } else {
      bookingDraft[question.key] = value;
    }

    bookingStep += 1;
    if (bookingStep < bookingQuestions.length) {
      addMsg(bookingQuestions[bookingStep].prompt, "bot");
      return;
    }

    awaitingBookingConfirmation = true;
    addMsg([
      "Please review your enquiry:",
      `Company: ${bookingDraft.company}`,
      `Name: ${bookingDraft.fullName}`,
      `Phone: ${bookingDraft.phone}`,
      `Email: ${bookingDraft.email}`,
      `Event: ${bookingDraft.eventType}`,
      `Date: ${bookingDraft.eventDate}`,
      `Guests: ${bookingDraft.guestCount}`,
      `City: ${bookingDraft.city}`,
      `Budget: ${bookingDraft.budget || "Not provided"}`,
      `Other details: ${bookingDraft.message || "None"}`,
      "Reply yes to submit, or no to cancel."
    ].join("\n"), "bot");
  }

  function handleUserText(text) {
    addMsg(text, "user");
    if (bookingDraft) {
      handleBookingText(text);
      return;
    }
    if (/\b(book|booking|reserve|enquir)\b/i.test(text)) {
      beginBooking();
      return;
    }
    addMsg(autoReply(text), "bot");
  }

  function setOpen(open) {
    panel.classList.toggle("open", open);
    openBtn?.classList.toggle("active", open);
    openBtn?.setAttribute("aria-expanded", String(open));
    if (open) openBtn?.querySelector(".fab-badge")?.remove();
  }
  openBtn?.addEventListener("click", () => {
    const open = !panel.classList.contains("open");
    setOpen(open);
    if (open && !body.dataset.greeted) {
      addMsg("Hi! I'm the One Ecosystem assistant. Ask me about pricing, availability, dates or services — or pick a quick question below.", "bot");
      body.dataset.greeted = "1";
      renderQuick();
    }
  });
  closeBtn?.addEventListener("click", () => setOpen(false));
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const val = input.value.trim();
    if (!val) return;
    handleUserText(val);
    input.value = "";
  });
})();
