(function () {
  const eventGrid = document.getElementById("eventGrid");
  const searchInput = document.getElementById("eventSearch");
  const dialog = document.getElementById("registrationDialog");
  const form = document.getElementById("registrationForm");
  const status = document.getElementById("eventsStatus");
  const registrationStatus = document.getElementById("registrationStatus");
  const registerButton = document.getElementById("registerButton");
  let events = [];

  function formattedDate(value) {
    const date = new Date(`${value}T00:00:00`);
    return {
      day: new Intl.DateTimeFormat(undefined, { day: "2-digit" }).format(date),
      month: new Intl.DateTimeFormat(undefined, { month: "short" }).format(date)
    };
  }

  function renderEvents() {
    const query = searchInput.value.trim().toLowerCase();
    const visibleEvents = events.filter(event =>
      `${event.title} ${event.city} ${event.venue} ${event.description}`.toLowerCase().includes(query)
    );
    eventGrid.replaceChildren();
    status.hidden = visibleEvents.length > 0;
    status.textContent = events.length
      ? "No events match that search. Try another event name or city."
      : "There are no upcoming events open for registration right now. Please check back soon.";

    for (const event of visibleEvents) {
      const date = formattedDate(event.eventDate);
      const card = document.createElement("article");
      card.className = "event-card";

      const dateBlock = document.createElement("div");
      dateBlock.className = "event-date";
      const day = document.createElement("strong");
      day.textContent = date.day;
      const month = document.createElement("span");
      month.textContent = date.month;
      dateBlock.append(day, month);

      const details = document.createElement("div");
      const title = document.createElement("h2");
      title.textContent = event.title;
      const description = document.createElement("p");
      description.textContent = event.description || "Join us for an upcoming One Ecosystem event.";
      const meta = document.createElement("div");
      meta.className = "event-meta";
      meta.textContent = [event.city, event.venue, event.startTime].filter(Boolean).join(" · ");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn btn-primary btn-small";
      button.textContent = "Register";
      button.addEventListener("click", () => openRegistration(event));
      details.append(title, description, meta, button);
      card.append(dateBlock, details);
      eventGrid.appendChild(card);
    }
  }

  function openRegistration(event) {
    form.reset();
    form.elements.eventId.value = event.id;
    form.elements.attendeeCount.max = String(event.capacity);
    document.getElementById("registrationEventName").textContent = `${event.title} · ${event.city}`;
    registrationStatus.textContent = "";
    registerButton.disabled = false;
    registerButton.textContent = "Confirm registration";
    dialog.showModal();
  }

  document.getElementById("closeRegistration").addEventListener("click", () => dialog.close());
  searchInput.addEventListener("input", renderEvents);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    registerButton.disabled = true;
    registerButton.textContent = "Registering…";
    registrationStatus.textContent = "";
    const formData = new FormData(form);
    const payload = {
      fullName: formData.get("fullName"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      attendeeCount: Number(formData.get("attendeeCount")),
      consentWhatsApp: formData.get("consentWhatsApp") === "on"
    };
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(formData.get("eventId"))}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Registration failed.");
      registerButton.textContent = "Registration saved";
      registrationStatus.textContent = result.automation?.delivered
        ? "You're registered. The connected event workflows have been notified."
        : "You're registered. Online sheet/notification workflows are not connected yet.";
    } catch (error) {
      registrationStatus.textContent = error.message;
      registerButton.disabled = false;
      registerButton.textContent = "Try again";
    }
  });

  fetch("/api/events").then(response => {
    if (!response.ok) throw new Error("Could not load events.");
    return response.json();
  }).then(result => {
    events = result;
    renderEvents();
  }).catch(error => {
    status.hidden = false;
    status.textContent = error.message;
  });
})();