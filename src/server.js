// Entry point. Load .env before anything reads process.env.
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const app = require("./app");
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`One Ecosystem running at http://localhost:${PORT}`);
});
