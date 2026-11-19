"use strict";

const fs = require("node:fs");
const path = require("node:path");

function findVallyResultsFile(outputDirectory) {
  const resultFiles = fs.readdirSync(outputDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(outputDirectory, entry.name, "results.jsonl"))
    .filter((file) => fs.existsSync(file));

  if (resultFiles.length !== 1) {
    throw new Error(
      `Expected one timestamped results.jsonl file, found ${resultFiles.length}.`
    );
  }
  const resultStat = fs.statSync(resultFiles[0]);
  if (!resultStat.isFile() || resultStat.size === 0) {
    throw new Error("Vally results.jsonl is not a non-empty file.");
  }
  return resultFiles[0];
}

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

function resolveRunExitCode(evaluationStatus, validationStatus) {
  if (typeof evaluationStatus !== "number" || evaluationStatus !== 0) {
    return evaluationStatus || 1;
  }
  if (validationStatus === 0 || validationStatus === 10) return 0;
  return validationStatus || 1;
}

module.exports = { findVallyJsonlOutput, findVallyResultsFile, resolveRunExitCode };
