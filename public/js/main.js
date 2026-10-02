// Renders the 5 company "doors" and the FAQ accordion on the home page.

(function renderDoors() {
  const grid = document.getElementById("doorsGrid");
  if (!grid) return;
  grid.innerHTML = COMPANIES.map(c => `
    <a class="door" style="--door-tint:${c.tint}" href="booking.html?company=${c.slug}">
      ${c.live ? '<span class="door-live">LIVE</span>' : ""}
      <div class="door-tag">${c.tag}</div>
      <div class="door-name">${c.name}</div>
      <p class="door-desc">${c.desc}</p>
      <span class="door-arrow">→</span>
    </a>
  `).join("");
})();

const HOME_FAQ = [
  {
    q: "What is actually broken in our industry?",
    a: "Nothing in the supply chain can be searched, priced and confirmed in one place. Venues, décor, artists and crew are found through contacts, and rates live in WhatsApp threads."
  },
  {
    q: "Why can a guest never find us?",
    a: "They check five platforms, get confused by all of it, and end up doing nothing. Discovery collapses long before a booking begins."
  },
  {
    q: "What does being on the platform change?",
    a: "A venue, décor package, artist or studio becomes a live listing — searchable from any city, priced up front and confirmed without a chase."
  },
  {
    q: "Do I have to change how I work?",
    a: "No. Your brand, your rates and your clients stay yours. A listing adds a channel; it replaces nothing you already run."
  },
  {
    q: "Why does a travel platform fix this?",
    a: "Because events already move people. Rooms, flights, transfers and experiences run on rails Mondee, Miraee and Aarna operate today — 65,000 travel experts, two million properties, fifty million searches a day."
  }
];

(function renderFaq() {
  const list = document.getElementById("faqList");
  if (!list) return;
  list.innerHTML = HOME_FAQ.map((item, i) => `
    <div class="faq-item" data-i="${i}">
      <button class="faq-q" type="button">
        ${item.q} <span class="mark">+</span>
      </button>
      <div class="faq-a"><p>${item.a}</p></div>
    </div>
  `).join("");

  list.querySelectorAll(".faq-item").forEach(item => {
    const btn = item.querySelector(".faq-q");
    btn.addEventListener("click", () => {
      const wasOpen = item.classList.contains("open");
      list.querySelectorAll(".faq-item").forEach(i => {
        i.classList.remove("open");
        i.querySelector(".mark").textContent = "+";
      });
      if (!wasOpen) {
        item.classList.add("open");
        item.querySelector(".mark").textContent = "–";
      }
    });
  });
})();
