const fs = require("fs");
const { createObjectCsvWriter } = require("csv-writer");
const csv = require("csv-parser");

function ensureCsv(filePath, header) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, header.map(h => h.title).join(",") + "\n");
  }
  return Promise.resolve();
}

function appendRow(filePath, header, row) {
  const csvWriter = createObjectCsvWriter({ path: filePath, header, append: true });
  return csvWriter.writeRecords([row]);
}

function readCsvAsJson(filePath) {
  return new Promise((resolve) => {
    if (!fs.existsSync(filePath)) return resolve([]);
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (d) => {
        const hasValue = Object.values(d).some(v => (v || "").toString().trim() !== "");
        if (hasValue) rows.push(d);
      })
      .on("end", () => resolve(rows))
      .on("error", () => resolve([]));
  });
}

module.exports = { ensureCsv, appendRow, readCsvAsJson };
