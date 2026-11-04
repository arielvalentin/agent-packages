#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");

const SHARD_COUNT = 4;
const configFile = process.argv[2];
if (!configFile) {
  console.error("Usage: node script/check-promptfoo-shards.js <promptfoo-config>");
  process.exit(2);
}

let config;
try {
  config = yaml.load(fs.readFileSync(configFile, "utf8"));
} catch (error) {
  console.error(`Unable to read valid Promptfoo config from ${path.resolve(configFile)}: ${error.message}`);
  process.exit(1);
}

const tests = config?.tests;
if (!Array.isArray(tests) || tests.length === 0) {
  console.error("Promptfoo config must contain at least one test case.");
  process.exit(1);
}

const shards = Array.from({ length: SHARD_COUNT }, (_, index) =>
  tests.filter((testCase) => testCase?.metadata?.shard === index + 1)
);

let invalid = false;
for (const [index, testCase] of tests.entries()) {
  const shard = testCase?.metadata?.shard;
  if (!Number.isInteger(shard) || shard < 1 || shard > SHARD_COUNT) {
    console.error(
      `Test case ${index + 1} (${testCase?.description || "unnamed"}) must have one shard from 1 to ${SHARD_COUNT}.`
    );
    invalid = true;
  }

  const membershipCount = shards.filter((partition) => partition.includes(testCase)).length;
  if (membershipCount !== 1) {
    console.error(
      `Test case ${index + 1} (${testCase?.description || "unnamed"}) belongs to ${membershipCount} shards.`
    );
    invalid = true;
  }
}

for (const suite of ["smoke", "full"]) {
  const selected = tests.filter((testCase) =>
    suite === "full" || testCase?.metadata?.suite === "smoke"
  );
  const selectedShards = shards.map((shard) =>
    shard.filter((testCase) => selected.includes(testCase))
  );
  const partitioned = selectedShards.flat();
  if (partitioned.length !== selected.length) {
    console.error(
      `The ${suite} suite partitions ${partitioned.length} of ${selected.length} selected cases.`
    );
    invalid = true;
  }
  for (const [index, shard] of selectedShards.entries()) {
    if (shard.length === 0) {
      console.error(`The ${suite} suite has no cases assigned to shard ${index + 1}.`);
      invalid = true;
    }
  }
}

if (invalid) process.exitCode = 1;
else console.log(`Validated ${tests.length} test cases across ${SHARD_COUNT} shards.`);
