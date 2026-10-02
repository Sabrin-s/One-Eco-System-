const express = require("express");
const cors = require("cors");
const { PUBLIC_DIR } = require("./config/paths");
const { loadSession } = require("./middleware/auth");

const app = express();

app.use(cors());
// Card photos for AI extraction are larger than the default 100 KB JSON limit.
app.use("/api/admin/card-ai", express.json({ limit: "12mb" }));
app.use(express.json({
  verify(req, res, buffer) {
    req.rawBody = Buffer.from(buffer); // kept for Meta webhook signature checks
  }
}));
app.use(express.static(PUBLIC_DIR));
app.use(loadSession);

app.use(require("./routes/auth"));
app.use(require("./routes/bookings"));
app.use(require("./routes/contacts"));
app.use(require("./routes/card-scrape"));
app.use(require("./routes/card-ai"));
app.use(require("./routes/events"));
app.use(require("./routes/integrations"));
app.use(require("./routes/webhooks"));

module.exports = app;
