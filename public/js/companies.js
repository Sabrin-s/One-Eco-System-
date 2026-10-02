// Shared company directory for One Ecosystem.
// Edit phone / instagram / tint per company once you have their real handles.
const COMPANIES = [
  {
    slug: "tabhi-ai",
    name: "Tabhi.ai",
    tag: "The group platform",
    live: false,
    tint: "#4A6FA5",
    desc: "The intelligence layer the network runs on — including Abhee, the hyperlocal experiential marketplace for hosts and curators.",
    formNote: "Best for: experience hosts, curators and creators who want a bookable listing.",
    whatsapp: "919427836887",
    instagram: "tabhi.ai",
    website: "https://tabhi.ai"
  },
  {
    slug: "mondee",
    name: "Mondee",
    tag: "Agentic AI travel marketplace",
    live: true,
    tint: "#E2672B",
    desc: "Global hotel and travel inventory at privately negotiated rates — one hotel desk for every event, globally.",
    formNote: "Best for: accommodation, group blocks and travel for guests and delegates.",
    whatsapp: "919427836887",
    instagram: "mondee",
    website: "https://mondee.com"
  },
  {
    slug: "miraee",
    name: "Miraee",
    tag: "Next-gen employee travel",
    live: false,
    tint: "#2E7D6B",
    desc: "AI-driven and built for cost efficiency — the MICE side: offsites, conferences and incentive travel, on the same rates.",
    formNote: "Best for: corporate offsites, conferences and incentive travel.",
    whatsapp: "919427836887",
    instagram: "miraee",
    website: "https://mondee.com"
  },
  {
    slug: "aarna",
    name: "Aarna",
    tag: "Creator & host platform",
    live: true,
    tint: "#8A4FBE",
    desc: "Hosts publish a venue, décor package or experience and own their rates and calendar — searchable from any city.",
    formNote: "Best for: venues, décor packages and one-off experiences.",
    whatsapp: "919427836887",
    instagram: "aarna.global",
    website: "https://aarna.global"
  },
  {
    slug: "silver-tree-events",
    name: "Silver Tree Events",
    tag: "Décor & full-scope production",
    live: true,
    tint: "#B5484D",
    desc: "Own décor inventory and crew, full scope from concept to site — destination weddings, corporate events and thematic celebrations.",
    formNote: "Best for: weddings, décor design, and on-ground production and execution.",
    whatsapp: "919427836887",
    instagram: "silvertreeevents",
    website: "https://instagram.com/silvertreeevents"
  }
];

function getCompanyBySlug(slug){
  return COMPANIES.find(c => c.slug === slug);
}
