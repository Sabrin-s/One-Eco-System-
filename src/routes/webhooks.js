// Meta webhooks for WhatsApp Cloud API and Instagram Messaging.
// Incoming messages go to n8n when configured; otherwise a local FAQ
// auto-reply is used as a development fallback.
const express = require("express");
const { autoReply } = require("../lib/faq");
const { sendToN8n } = require("../lib/n8n");
const { verifyMetaSignature } = require("../middleware/meta-signature");

const router = express.Router();

function verifySubscription(tokenEnvName) {
  return (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === process.env[tokenEnvName]) {
      return res.status(200).send(challenge);
    }
    res.sendStatus(403);
  };
}

// ---------------------------------------------------------------
// WhatsApp — requires WHATSAPP_VERIFY_TOKEN, WHATSAPP_TOKEN, WHATSAPP_PHONE_ID
// Point your Meta App's WhatsApp webhook at: https://yourdomain.com/webhook/whatsapp
// ---------------------------------------------------------------
router.get("/webhook/whatsapp", verifySubscription("WHATSAPP_VERIFY_TOKEN"));

router.post("/webhook/whatsapp", verifyMetaSignature, async (req, res) => {
  res.sendStatus(200); // ack immediately, Meta requires a fast 200
  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    const message = change?.messages?.[0];
    if (!message || message.is_echo) return;

    const from = message.from;
    const text = message.text?.body || "";
    if (process.env.N8N_INBOUND_WEBHOOK_URL && process.env.N8N_WEBHOOK_SECRET) {
      await sendToN8n(process.env.N8N_INBOUND_WEBHOOK_URL, {
        type: "message.inbound", platform: "whatsapp", senderId: from,
        messageId: message.id, text, phoneNumberId: change.metadata?.phone_number_id
      });
      return;
    }
    const reply = autoReply(text);

    if (process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID) {
      await fetch(`https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: from,
          text: { body: reply }
        })
      });
    } else {
      console.log(`[WhatsApp demo] Would reply to ${from}: "${reply}"`);
    }
  } catch (err) {
    console.error("WhatsApp webhook error:", err);
  }
});

// ---------------------------------------------------------------
// Instagram — requires INSTAGRAM_VERIFY_TOKEN, INSTAGRAM_TOKEN, INSTAGRAM_ACCOUNT_ID
// Point your Meta App's Instagram webhook at: https://yourdomain.com/webhook/instagram
// ---------------------------------------------------------------
router.get("/webhook/instagram", verifySubscription("INSTAGRAM_VERIFY_TOKEN"));

router.post("/webhook/instagram", verifyMetaSignature, async (req, res) => {
  res.sendStatus(200);
  try {
    const entry = req.body?.entry?.[0];
    const messaging = entry?.messaging?.[0];
    const senderId = messaging?.sender?.id;
    const text = messaging?.message?.text || "";
    if (!senderId || !text || messaging.message.is_echo) return;

    if (process.env.N8N_INBOUND_WEBHOOK_URL && process.env.N8N_WEBHOOK_SECRET) {
      await sendToN8n(process.env.N8N_INBOUND_WEBHOOK_URL, {
        type: "message.inbound", platform: "instagram", senderId,
        messageId: messaging.message.mid, text, accountId: entry.id
      });
      return;
    }

    const reply = autoReply(text);

    if (process.env.INSTAGRAM_TOKEN) {
      await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${process.env.INSTAGRAM_TOKEN}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: senderId },
          message: { text: reply }
        })
      });
    } else {
      console.log(`[Instagram demo] Would reply to ${senderId}: "${reply}"`);
    }
  } catch (err) {
    console.error("Instagram webhook error:", err);
  }
});

module.exports = router;
