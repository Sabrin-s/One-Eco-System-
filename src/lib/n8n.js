async function sendToN8n(webhookUrl, event) {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!webhookUrl || !secret) return { configured: false, delivered: false };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ ...event, sentAt: new Date().toISOString() }),
      signal: controller.signal
    });
    return { configured: true, delivered: response.ok };
  } catch (error) {
    console.error("n8n workflow delivery failed:", error.message);
    return { configured: true, delivered: false };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { sendToN8n };
