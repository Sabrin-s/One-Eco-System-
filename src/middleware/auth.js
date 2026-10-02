const crypto = require("crypto");

const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || crypto.randomBytes(32).toString("hex");

function safeEqual(left, right) {
  const leftHash = crypto.createHash("sha256").update(String(left)).digest();
  const rightHash = crypto.createHash("sha256").update(String(right)).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

function signSession(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

// Reads the oe_session cookie and sets req.user for valid, unexpired admin sessions.
function loadSession(req, res, next) {
  const token = (req.headers.cookie || "").match(/(?:^|;\s*)oe_session=([^;]+)/)?.[1];
  if (token) {
    const [encoded, signature] = token.split(".");
    const expected = crypto.createHmac("sha256", SESSION_SECRET).update(encoded || "").digest("base64url");
    if (signature && safeEqual(signature, expected)) {
      try {
        const session = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
        if (session.role === "admin" && session.expiresAt > Date.now()) req.user = session;
      } catch { /* Ignore malformed session cookies. */ }
    }
  }
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(401).json({ ok: false, error: "Admin sign-in required." });
  next();
}

module.exports = { safeEqual, signSession, loadSession, requireAdmin };
