#!/usr/bin/env bash
# Validates authoritative structured policy assertions in coordinator Markdown.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"

node "$root/packages/coordinator/tests/policy-assertions.test.cjs"
node "$root/packages/coordinator/tests/check-policy-assertions.cjs"
