"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { findVallyJsonlOutput } = require("./vally-output.js");

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
