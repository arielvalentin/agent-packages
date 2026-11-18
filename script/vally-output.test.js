"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  findVallyJsonlOutput,
  findVallyResultsFile,
  resolveRunExitCode,
} = require("./vally-output.js");

test("finds the action-captured stdout JSONL and rejects missing or ambiguous streams", () => {
  const diagnosticsDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "vally-diagnostics-"));
  try {
    fs.writeFileSync(path.join(diagnosticsDirectory, "version.stdout.log"), "0.19.0\n");
    const evalOutput = path.join(diagnosticsDirectory, "eval.stdout.log");
    fs.writeFileSync(evalOutput, [
      JSON.stringify({ type: "trial-result" }),
      JSON.stringify({ type: "run-summary" }),
      "",
    ].join("\n"));
    assert.equal(findVallyJsonlOutput(diagnosticsDirectory), evalOutput);

    fs.writeFileSync(path.join(diagnosticsDirectory, "duplicate.stdout.log"), [
      JSON.stringify({ type: "trial-result" }),
      JSON.stringify({ type: "run-summary" }),
      "",
    ].join("\n"));
    assert.throws(() => findVallyJsonlOutput(diagnosticsDirectory), /found 2/);

    fs.rmSync(evalOutput);
    fs.rmSync(path.join(diagnosticsDirectory, "duplicate.stdout.log"));
    assert.throws(() => findVallyJsonlOutput(diagnosticsDirectory), /found 0/);
  } finally {
    fs.rmSync(diagnosticsDirectory, { recursive: true, force: true });
  }
});

test("finds file-mode JSONL in Vally's timestamped output directory", () => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "vally-output-"));
  try {
    const runDirectory = path.join(outputDirectory, "2026-11-09T12-00-00-000Z");
    fs.mkdirSync(runDirectory);
    fs.writeFileSync(path.join(runDirectory, "results.jsonl"), "{\"type\":\"run-summary\"}\n");
    assert.equal(
      findVallyResultsFile(outputDirectory),
      path.join(runDirectory, "results.jsonl")
    );
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test("rejects missing, duplicate, and empty Vally result files", () => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "vally-output-"));
  try {
    assert.throws(() => findVallyResultsFile(outputDirectory), /found 0/);

    for (const run of ["run-one", "run-two"]) {
      const runDirectory = path.join(outputDirectory, run);
      fs.mkdirSync(runDirectory);
      fs.writeFileSync(path.join(runDirectory, "results.jsonl"), "{\"type\":\"run-summary\"}\n");
    }
    assert.throws(() => findVallyResultsFile(outputDirectory), /found 2/);

    fs.rmSync(path.join(outputDirectory, "run-two"), { recursive: true });
    fs.writeFileSync(path.join(outputDirectory, "run-one", "results.jsonl"), "");
    assert.throws(() => findVallyResultsFile(outputDirectory), /non-empty/);
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test("diagnostic assertion failures cannot hide a Vally process failure", () => {
  assert.equal(resolveRunExitCode(0, 10), 0);
  assert.equal(resolveRunExitCode(0, 0), 0);
  assert.equal(resolveRunExitCode(1, 10), 1);
  assert.equal(resolveRunExitCode(2, 10), 2);
  assert.equal(resolveRunExitCode(0, 1), 1);
  assert.equal(resolveRunExitCode(null, 10), 1);
});
