// Keeps the public site and the admin area on separate links.
//
// Default (no ADMIN_HOST): one address — public pages at "/", admin at "/admin".
// With ADMIN_HOST set (e.g. admin.example.com pointing at this same app):
//   - the admin area and admin APIs answer only on that host (404 elsewhere)
//   - that host's "/" opens the admin panel; other public pages redirect to PUBLIC_URL
// Both sides share the same server and data, so bookings show up in admin.
const express = require("express");
const path = require("path");
const { ADMIN_DIR } = require("../config/paths");

const adminHost = () => (process.env.ADMIN_HOST || "").trim().toLowerCase();
const publicUrl = () => (process.env.PUBLIC_URL || "").trim().replace(/\/$/, "");
const isAdminHost = (req) => adminHost() !== "" && req.hostname.toLowerCase() === adminHost();
const SHARED_ASSET = /^\/(css|js|assets)\//; // site styles, companies.js, images used by both sides
const ADMIN_API = /^\/api\/(admin\/|bookings|contacts)/;

function hideOnPublicHost(req, res, next) {
  if (adminHost() && !isAdminHost(req)) return res.status(404).send("Not found");
  next();
}

function siteSplit() {
  const router = express.Router();

  // Old links keep working.
  router.get("/admin.html", (req, res) => res.redirect(301, "/admin"));
  router.get("/card-scrape.html", (req, res) => res.redirect(301, "/admin/card-scrape"));

  // On the admin host, send visitors of public pages to the public site.
  router.use((req, res, next) => {
    if (!isAdminHost(req) || req.method !== "GET") return next();
    if (req.path === "/") return res.redirect("/admin");
    if (req.path.startsWith("/admin") || req.path.startsWith("/api/") || SHARED_ASSET.test(req.path)) return next();
    return publicUrl() ? res.redirect(publicUrl() + req.originalUrl) : res.redirect("/admin");
  });

  // Admin APIs are unreachable from the public host when the split is on.
  router.use((req, res, next) => (ADMIN_API.test(req.path) ? hideOnPublicHost(req, res, next) : next()));

  router.get("/admin/card-scrape", hideOnPublicHost, (req, res) => res.sendFile(path.join(ADMIN_DIR, "card-scrape.html")));
  router.use("/admin", hideOnPublicHost, express.static(ADMIN_DIR));

  return router;
}

module.exports = { siteSplit };
