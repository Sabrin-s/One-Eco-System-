// Shared motion for the public pages: nav state, scroll progress, reveal on
// scroll, count-up stats, hero word split, marquee, card spotlight/tilt,
// timeline + flow line drawing, and a light particle field in the hero.
// Everything is skipped or simplified when the visitor prefers reduced motion.

(function () {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.documentElement.classList.add("js-motion");

  // ---- nav shadow + scroll progress ----
  const nav = document.querySelector(".topnav");
  const progress = document.getElementById("scrollProgress");
  function onScroll() {
    const y = window.scrollY;
    nav?.classList.toggle("scrolled", y > 12);
    if (progress) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
    }
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // ---- hero headline: split into words that rise in one after another ----
  document.querySelectorAll(".split-words").forEach(h => {
    let i = 0;
    const wrapWords = (node) => {
      [...node.childNodes].forEach(child => {
        if (child.nodeType === Node.TEXT_NODE) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            const outer = document.createElement("span");
            outer.className = "w";
            const inner = document.createElement("span");
            inner.textContent = part;
            inner.style.setProperty("--wi", i++);
            outer.appendChild(inner);
            frag.appendChild(outer);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          wrapWords(child);
        }
      });
    };
    wrapWords(h);
  });
  requestAnimationFrame(() => document.body.classList.add("loaded"));

  // ---- marquee of company names (duplicated for a seamless loop) ----
  const marquee = document.getElementById("marqueeTrack");
  if (marquee && typeof COMPANIES !== "undefined") {
    const items = COMPANIES.map(c => `<span><i style="background:${c.tint}"></i>${c.name}<em>${c.tag}</em></span>`).join("");
    marquee.innerHTML = items + items + items + items;
  }

  // ---- auto-tag dynamic content for reveal, with a stagger per group ----
  const groups = [".doors .door", ".faq-list .faq-item", ".timeline > div", ".event-grid .event-card"];
  function tagGroups() {
    groups.forEach(sel => document.querySelectorAll(sel).forEach((el, i) => {
      if (!el.hasAttribute("data-reveal")) el.setAttribute("data-reveal", "");
      el.style.setProperty("--stagger", i);
    }));
    document.querySelectorAll(".flow-step, .stat-strip .stat").forEach((el, i, all) => {
      el.style.setProperty("--stagger", [...el.parentElement.children].indexOf(el));
    });
  }
  tagGroups();

  // ---- count-up numbers ----
  function countUp(el) {
    const target = parseFloat(el.dataset.count);
    const decimals = (el.dataset.count.split(".")[1] || "").length;
    const prefix = el.dataset.prefix || "";
    const suffix = el.dataset.suffix || "";
    if (reduceMotion) { el.textContent = prefix + target.toFixed(decimals) + suffix; return; }
    const start = performance.now();
    const dur = 1600;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 4);
      el.textContent = prefix + (target * eased).toFixed(decimals) + suffix;
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ---- reveal on scroll ----
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      el.classList.add("in");
      el.querySelectorAll("[data-count]").forEach(countUp);
      if (el.matches("[data-count]")) countUp(el);
      io.unobserve(el);
    });
  }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });

  function observeAll() {
    document.querySelectorAll("[data-reveal]:not(.in), .timeline, .flow").forEach(el => io.observe(el));
  }
  observeAll();

  // Re-scan when lists render later (e.g. events loaded from the API).
  window.refreshMotion = function () { tagGroups(); observeAll(); };
  const eventGrid = document.getElementById("eventGrid");
  if (eventGrid) new MutationObserver(() => window.refreshMotion()).observe(eventGrid, { childList: true });

  // ---- spotlight + tilt on cards ----
  if (!reduceMotion && window.matchMedia("(hover: hover)").matches) {
    document.addEventListener("pointermove", (e) => {
      const card = e.target.closest(".door, .flow-step, .event-card");
      if (!card) return;
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      card.style.setProperty("--mx", `${x * 100}%`);
      card.style.setProperty("--my", `${y * 100}%`);
      if (card.classList.contains("door")) {
        card.style.setProperty("--rx", `${(0.5 - y) * 8}deg`);
        card.style.setProperty("--ry", `${(x - 0.5) * 10}deg`);
      }
    });
    document.addEventListener("pointerout", (e) => {
      const card = e.target.closest?.(".door");
      if (card && !card.contains(e.relatedTarget)) {
        card.style.setProperty("--rx", "0deg");
        card.style.setProperty("--ry", "0deg");
      }
    });
  }

  // ---- hero particle field ----
  const canvas = document.getElementById("heroParticles");
  if (canvas && !reduceMotion) {
    const ctx = canvas.getContext("2d");
    let w, h, dots = [];
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.offsetWidth; h = canvas.offsetHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(70, (w * h) / 16000));
      dots = Array.from({ length: count }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25,
        r: Math.random() * 1.6 + 0.4
      }));
    };
    resize();
    window.addEventListener("resize", resize);
    let visible = true;
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);
    const draw = () => {
      if (visible) {
        ctx.clearRect(0, 0, w, h);
        for (let i = 0; i < dots.length; i++) {
          const a = dots[i];
          a.x += a.vx; a.y += a.vy;
          if (a.x < 0 || a.x > w) a.vx *= -1;
          if (a.y < 0 || a.y > h) a.vy *= -1;
          ctx.beginPath();
          ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(242,166,107,.55)";
          ctx.fill();
          for (let j = i + 1; j < dots.length; j++) {
            const b = dots[j];
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            if (d < 110) {
              ctx.strokeStyle = `rgba(220,230,240,${0.12 * (1 - d / 110)})`;
              ctx.lineWidth = 1;
              ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
            }
          }
        }
      }
      requestAnimationFrame(draw);
    };
    draw();
  }
})();
