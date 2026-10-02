const express = require("express");
const { safeEqual, signSession } = require("../middleware/auth");

const router = express.Router();

router.post("/api/admin/login", (req, res) => {
  const email = (req.body?.email || "").trim().toLowerCase();
  const password = req.body?.password || "";
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD || !process.env.ADMIN_SESSION_SECRET) {
    return res.status(503).json({ ok: false, error: "Admin credentials are not configured on the server." });
  }
  if (!safeEqual(email, process.env.ADMIN_EMAIL.trim().toLowerCase()) || !safeEqual(password, process.env.ADMIN_PASSWORD)) {
    return res.status(401).json({ ok: false, error: "Email or password is incorrect." });
  }
  const value = signSession({ role: "admin", email, expiresAt: Date.now() + 8 * 60 * 60 * 1000 });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `oe_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${secure}`);
  res.json({ ok: true, user: { role: "admin", email } });
});

router.get("/api/admin/session", (req, res) => {
  res.json({ authenticated: req.user?.role === "admin", user: req.user ? { role: req.user.role, email: req.user.email } : null });
});

router.post("/api/admin/logout", (req, res) => {
  res.setHeader("Set-Cookie", "oe_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
  res.json({ ok: true });
});

module.exports = router;
