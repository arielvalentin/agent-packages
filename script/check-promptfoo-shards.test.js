const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

const checkerPath = "script/check-promptfoo-shards.js";

function runChecker(tests) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "promptfoo-shards-"));
  try {
    const configFile = path.join(directory, "promptfooconfig.yaml");
    fs.writeFileSync(configFile, JSON.stringify({ tests }));
    return spawnSync(process.execPath, [checkerPath, configFile], { encoding: "utf8" });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test("smoke and full cases are partitioned across valid shard tags", () => {
  const result = runChecker([
    { description: "smoke one", metadata: { suite: "smoke", shard: 1 } },
    { description: "smoke two", metadata: { suite: "smoke", shard: 2 } },
    { description: "smoke three", metadata: { suite: "smoke", shard: 3 } },
    { description: "smoke four", metadata: { suite: "smoke", shard: 4 } },
    { description: "full only", metadata: { shard: 1 } },
  ]);
  assert.equal(result.status, 0, result.stderr);
});

test("every test case must have exactly one valid shard tag", () => {
  const missing = runChecker([
    { description: "untagged", metadata: { suite: "smoke" } },
  ]);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /must have one shard from 1 to 4/);

  const invalid = runChecker([
    { description: "out of range", metadata: { shard: 5 } },
  ]);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /must have one shard from 1 to 4/);
});

test("every shard contains cases for both smoke and full selections", () => {
  const result = runChecker([
    { description: "only case", metadata: { suite: "smoke", shard: 1 } },
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /has no cases assigned to shard 2/);
});
