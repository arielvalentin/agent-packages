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

function resolveRunExitCode(evaluationStatus, validationStatus) {
  if (typeof evaluationStatus !== "number" || evaluationStatus !== 0) {
    return evaluationStatus || 1;
  }
  if (validationStatus === 0 || validationStatus === 10) return 0;
  return validationStatus || 1;
}

module.exports = { findVallyResultsFile, resolveRunExitCode };
