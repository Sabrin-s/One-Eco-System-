(function () {
  const params = new URLSearchParams(location.search);
  const slug = params.get("company") || "silver-tree-events";
  const company = getCompanyBySlug(slug) || COMPANIES[0];

  document.getElementById("companyPill").textContent = company.name + " · " + company.tag;
  document.getElementById("companyHeadline").textContent = "Book with " + company.name;
  document.getElementById("companyNote").textContent = company.formNote;
  document.getElementById("waFab").href = `https://wa.me/${company.whatsapp}?text=${encodeURIComponent("Hi " + company.name + ", I'd like to enquire about an event.")}`;

  const EVENT_TYPES = ["Wedding", "Corporate event", "Conference / MICE", "Birthday / private party", "Experience / activity", "Other"];
  const BUDGETS = ["Under ₹1L", "₹1L–5L", "₹5L–15L", "₹15L+", "Not sure yet"];

  function renderChips(containerId, options) {
    const el = document.getElementById(containerId);
    el.innerHTML = options.map(o => `<button type="button" class="chip-opt" data-val="${o}">${o}</button>`).join("");
    el.addEventListener("click", (e) => {
      const btn = e.target.closest(".chip-opt");
      if (!btn) return;
      el.querySelectorAll(".chip-opt").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
    });
  }
  renderChips("eventTypeChips", EVENT_TYPES);
  renderChips("budgetChips", BUDGETS);

  // ---- step navigation ----
  const steps = Array.from(document.querySelectorAll(".step"));
  let current = 1;
  const progressSpans = document.querySelectorAll("#progressTrack span");

  function showStep(n) {
    steps.forEach(s => s.classList.toggle("active", s.dataset.step == n));
    document.getElementById("stepNum").textContent = (n === "confirm") ? 3 : n;
    progressSpans.forEach((s, i) => s.classList.toggle("done", i < (n === "confirm" ? 3 : n)));
  }

  document.querySelectorAll("[data-next]").forEach(btn => {
    btn.addEventListener("click", () => {
      const stepEl = btn.closest(".step");
      const required = stepEl.querySelectorAll("input[required]");
      for (const r of required) {
        if (!r.value) { r.focus(); r.reportValidity?.(); return; }
      }
      current++;
      showStep(current);
    });
  });
  document.querySelectorAll("[data-back]").forEach(btn => {
    btn.addEventListener("click", () => { current--; showStep(current); });
  });

  // ---- submit ----
  const form = document.getElementById("bookingForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = {
      company: company.name,
      companySlug: company.slug,
      fullName: fd.get("fullName") || "",
      phone: fd.get("phone") || "",
      email: fd.get("email") || "",
      eventType: document.querySelector('#eventTypeChips .selected')?.dataset.val || "",
      eventDate: fd.get("eventDate") || "",
      guestCount: fd.get("guestCount") || "",
      city: fd.get("city") || "",
      budget: document.querySelector('#budgetChips .selected')?.dataset.val || "",
      message: fd.get("message") || "",
      submittedAt: new Date().toISOString()
    };

    const submitBtn = document.getElementById("submitBtn");
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting…";

    try {
      const res = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error("Request failed");
    } catch (err) {
      // Still show confirmation locally so the demo works even if the
      // Node server isn't running (e.g. opened as a static file).
      console.warn("Booking API unavailable, showing local confirmation:", err.message);
    }

    document.getElementById("confirmCompany").textContent = company.name;
    document.getElementById("summaryCard").innerHTML = `
      <div><span>Event type</span><strong>${payload.eventType || "—"}</strong></div>
      <div><span>Date</span><strong>${payload.eventDate || "—"}</strong></div>
      <div><span>Guests</span><strong>${payload.guestCount || "—"}</strong></div>
      <div><span>Budget</span><strong>${payload.budget || "—"}</strong></div>
    `;
    const waText = `Hi ${company.name}, I just submitted a booking enquiry.\nName: ${payload.fullName}\nEvent: ${payload.eventType || "n/a"} on ${payload.eventDate || "TBC"}\nGuests: ${payload.guestCount || "n/a"}\nBudget: ${payload.budget || "n/a"}`;
    document.getElementById("waFollowup").href = `https://wa.me/${company.whatsapp}?text=${encodeURIComponent(waText)}`;

    current = "confirm";
    showStep(current);
    celebrate();
  });

  function celebrate() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const layer = document.createElement("div");
    layer.className = "confetti";
    const colors = ["#E2672B", "#F2A66B", "#2E8B57", "#4A6FA5", "#8A4FBE", "#B5484D"];
    for (let i = 0; i < 90; i++) {
      const bit = document.createElement("i");
      bit.style.left = `${Math.random() * 100}%`;
      bit.style.background = colors[i % colors.length];
      bit.style.setProperty("--dx", `${(Math.random() - 0.5) * 240}px`);
      bit.style.setProperty("--rot", `${Math.random() * 720 - 360}deg`);
      bit.style.animationDuration = `${2.2 + Math.random() * 1.8}s`;
      bit.style.animationDelay = `${Math.random() * 0.4}s`;
      layer.appendChild(bit);
    }
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 4800);
  }
})();
