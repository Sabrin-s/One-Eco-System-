const fs = require("fs");

async function readJsonList(filePath) {
  try {
    const value = JSON.parse(await fs.promises.readFile(filePath, "utf8"));
    return Array.isArray(value) ? value : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeJsonList(filePath, value) {
  const temporaryPath = `${filePath}.tmp`;
  await fs.promises.writeFile(temporaryPath, JSON.stringify(value, null, 2));
  await fs.promises.rename(temporaryPath, filePath);
}

module.exports = { readJsonList, writeJsonList };
