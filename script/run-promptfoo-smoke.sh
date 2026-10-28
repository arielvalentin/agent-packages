#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 || ! -f "$1" ]]; then
  echo "Usage: $0 <promptfoo-config>" >&2
  exit 2
fi

output_base="$(mktemp)"
output="${output_base}.json"
trap 'rm -f "$output"' EXIT
rm -f "$output_base"

eval_status=0
npx --no-install promptfoo eval \
  --config "$1" \
  --filter-metadata suite=smoke \
  --output "$output" || eval_status=$?

validation_status=0
if [[ ! -s "$output" ]]; then
  echo "Promptfoo did not produce eval results; refusing to report success." >&2
  validation_status=1
else
  node script/validate-promptfoo-eval.js "$output" smoke || validation_status=$?
fi

if [[ $eval_status -ne 0 ]]; then
  exit "$eval_status"
fi
exit "$validation_status"
