(function () {
  const eventForm = document.getElementById("eventForm");
  if (!eventForm) return;

  const eventRows = document.querySelector("#eventsTable tbody");
  const registrationRows = document.querySelector("#registrationsTable tbody");
  const eventFilter = document.getElementById("registrationEventFilter");
  const eventStatus = document.getElementById("eventStatusMessage");
  const attendanceStatus = document.getElementById("attendanceStatus");
  const thankYouStatus = document.getElementById("thankYouStatus");
  let events = [];

  async function api(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) }
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Request failed.");
    return result;
  }

  function addCell(row, value) {
    const cell = document.createElement("td");
    cell.textContent = value ?? "";
    row.appendChild(cell);
    return cell;
  }

  function addButton(cell, label, action, className = "btn btn-dark btn-small") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.addEventListener("click", action);
    cell.appendChild(button);
  }

  async function loadEvents() {
    events = await api("/api/admin/events");
    eventRows.replaceChildren();
    eventFilter.replaceChildren(new Option("All events", ""));
    for (const event of events) {
      eventFilter.add(new Option(event.title, event.id));
      const row = document.createElement("tr");
      addCell(row, event.title);
      addCell(row, `${event.eventDate}${event.startTime ? ` · ${event.startTime}` : ""}`);
      addCell(row, event.city);
      addCell(row, `${event.registeredCount} / ${event.capacity}`);
      addCell(row, event.status);
      const actions = document.createElement("td");
      addButton(actions, event.status === "published" ? "Unpublish" : "Publish", async () => {
        try {
          await api(`/api/admin/events/${event.id}`, {
            method: "PATCH",
            body: JSON.stringify({ status: event.status === "published" ? "draft" : "published" })
          });
          await loadEvents();
        } catch (error) {
          eventStatus.textContent = error.message;
        }
      });
      row.appendChild(actions);
      eventRows.appendChild(row);
    }
    if (!events.length) {
      const row = document.createElement("tr");
      addCell(row, "No events created yet.").colSpan = 6;
      eventRows.appendChild(row);
    }
  }

  async function loadRegistrations() {
    const eventId = eventFilter.value;
    const query = eventId ? `?eventId=${encodeURIComponent(eventId)}` : "";
    const registrations = await api(`/api/admin/registrations${query}`);
    registrationRows.replaceChildren();
    for (const registration of registrations) {
      const row = document.createElement("tr");
      addCell(row, registration.eventTitle);
      addCell(row, registration.fullName);
      addCell(row, `${registration.email}\n${registration.phone}`);
      addCell(row, registration.attendeeCount);
      addCell(row, registration.attendance === "present" ? "Present" : "Not marked");
      addCell(row, registration.consentWhatsApp ? "Yes" : "No");
      const actionCell = document.createElement("td");
      addButton(actionCell, registration.attendance === "present" ? "Undo" : "Mark present", async () => {
        try {
          const result = await api(`/api/admin/registrations/${registration.id}/attendance`, {
            method: "PATCH",
            body: JSON.stringify({ attended: registration.attendance !== "present" })
          });
          attendanceStatus.textContent = result.automation.delivered
            ? "Attendance saved and the Sheets workflow accepted the update."
            : "Attendance saved locally; the Sheets workflow is not configured or could not be reached.";
          await loadRegistrations();
        } catch (error) {
          attendanceStatus.textContent = error.message;
        }
      });
      row.appendChild(actionCell);
      registrationRows.appendChild(row);
    }
    if (!registrations.length) {
      const row = document.createElement("tr");
      addCell(row, "No registrations yet.").colSpan = 7;
      registrationRows.appendChild(row);
    }
  }

  async function loadIntegrationStatus() {
    const statusList = document.getElementById("integrationStatus");
    try {
      const status = await api("/api/admin/integrations");
      statusList.replaceChildren();
      const labels = [
        ["registrations", "Registration to Google Sheets workflow"],
        ["contacts", "Scanned contacts to Google Sheets workflow"],
        ["thankYou", "Attendee thank-you workflow"],
        ["inboundMessages", "WhatsApp / Instagram inbound workflow"],
        ["secret", "Shared webhook secret"]
      ];
      for (const [key, label] of labels) {
        const item = document.createElement("li");
        item.textContent = `${label}: ${status[key] ? "Connected" : "Not configured"}`;
        statusList.appendChild(item);
      }
    } catch {
      statusList.textContent = "Could not check workflow status. Sign in and refresh.";
    }
  }

  eventForm.addEventListener("submit", async event => {
    event.preventDefault();
    eventStatus.textContent = "Saving event…";
    const payload = Object.fromEntries(new FormData(eventForm).entries());
    payload.capacity = Number(payload.capacity);
    try {
      await api("/api/admin/events", { method: "POST", body: JSON.stringify(payload) });
      eventForm.reset();
      eventStatus.textContent = "Event saved.";
      await loadEvents();
    } catch (error) {
      eventStatus.textContent = error.message;
    }
  });

  document.getElementById("refreshEvents").addEventListener("click", () => loadEvents().catch(error => {
    eventStatus.textContent = error.message;
  }));
  document.getElementById("refreshRegistrations").addEventListener("click", () => loadRegistrations().catch(error => {
    thankYouStatus.textContent = error.message;
  }));
  eventFilter.addEventListener("change", () => loadRegistrations().catch(error => {
    thankYouStatus.textContent = error.message;
  }));
  document.getElementById("sendThankYouBtn").addEventListener("click", async () => {
    if (!eventFilter.value) {
      thankYouStatus.textContent = "Choose an event first.";
      return;
    }
    if (!window.confirm("Send the configured thank-you message to present attendees who opted in to WhatsApp?")) return;
    thankYouStatus.textContent = "Sending…";
    try {
      const result = await api(`/api/admin/events/${eventFilter.value}/thank-you`, { method: "POST" });
      thankYouStatus.textContent = `Workflow accepted for ${result.recipientCount} opted-in attendee(s).`;
      await loadRegistrations();
    } catch (error) {
      thankYouStatus.textContent = error.message;
    }
  });

  document.addEventListener("admin:ready", () => {
    loadEvents().catch(error => { eventStatus.textContent = error.message; });
    loadRegistrations().catch(error => { thankYouStatus.textContent = error.message; });
    loadIntegrationStatus();
  });
  document.addEventListener("admin:tab", tab => {
    if (tab.detail === "events") loadEvents().catch(error => { eventStatus.textContent = error.message; });
    if (tab.detail === "attendees") loadRegistrations().catch(error => { thankYouStatus.textContent = error.message; });
    if (tab.detail === "automation") loadIntegrationStatus();
  });
  api("/api/admin/session").then(session => {
    if (session.authenticated) {
      loadEvents();
      loadRegistrations();
      loadIntegrationStatus();
    }
  }).catch(() => {});
})();