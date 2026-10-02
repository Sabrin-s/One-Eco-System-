const crypto = require("crypto");
const { safeEqual } = require("./auth");

function verifyMetaSignature(req, res, next) {
  const secret = process.env.META_APP_SECRET;
  const signature = req.get("x-hub-signature-256") || "";
  if (!secret) return res.status(503).json({ ok: false, error: "Meta webhook signature verification is not configured." });
  if (!/^sha256=[a-f0-9]{64}$/i.test(signature)) return res.sendStatus(401);
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(req.rawBody || Buffer.alloc(0)).digest("hex")}`;
  if (!safeEqual(signature, expected)) return res.sendStatus(401);
  next();
}

module.exports = { verifyMetaSignature };
