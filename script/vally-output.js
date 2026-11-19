"use strict";

const fs = require("node:fs");
const path = require("node:path");

function findVallyJsonlOutput(diagnosticsDirectory) {
  const resultFiles = fs.readdirSync(diagnosticsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".stdout.log"))
    .map((entry) => path.join(diagnosticsDirectory, entry.name))
    .filter((file) => {
      let hasTrial = false;
      let hasSummary = false;
      for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
        if (!line.trim()) continue;
        let record;
        try {
          record = JSON.parse(line);
        } catch {
          return false;
        }
        if (!record || typeof record !== "object" || Array.isArray(record)) return false;
        hasTrial ||= record.type === "trial-result";
        hasSummary ||= record.type === "run-summary";
      }
      return hasTrial && hasSummary;
    });

  if (resultFiles.length !== 1) {
    throw new Error(`Expected one Vally stdout JSONL stream, found ${resultFiles.length}.`);
  }
  return resultFiles[0];
}

module.exports = { findVallyJsonlOutput };
