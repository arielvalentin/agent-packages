#!/usr/bin/env bash
set -euo pipefail

node <<'NODE'
const lock = require(`${process.cwd()}/package-lock.json`);
const invalid = Object.entries(lock.packages)
  .filter(([, metadata]) => metadata.resolved)
  .filter(([, metadata]) =>
    !metadata.resolved.startsWith('https://registry.npmjs.org/'),
  );

if (invalid.length > 0) {
  console.error('Unexpected package registries:', invalid);
  process.exit(1);
}
NODE

npm_config_registry=https://registry.npmjs.org \
  npx --yes npm@10.9.4 ci --no-audit --no-fund
