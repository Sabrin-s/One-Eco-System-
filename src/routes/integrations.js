const express = require("express");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

router.get("/api/admin/integrations", requireAdmin, (req, res) => {
  res.json({
    registrations: Boolean(process.env.N8N_REGISTRATION_WEBHOOK_URL && process.env.N8N_WEBHOOK_SECRET),
    contacts: Boolean(process.env.N8N_CONTACT_WEBHOOK_URL && process.env.N8N_WEBHOOK_SECRET),
    thankYou: Boolean(process.env.N8N_THANK_YOU_WEBHOOK_URL && process.env.N8N_WEBHOOK_SECRET),
    inboundMessages: Boolean(process.env.N8N_INBOUND_WEBHOOK_URL && process.env.N8N_WEBHOOK_SECRET),
    secret: Boolean(process.env.N8N_WEBHOOK_SECRET)
  });
});

module.exports = router;
