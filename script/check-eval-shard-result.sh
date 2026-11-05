#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <shard-job-result>" >&2
  exit 2
fi

if [[ "$1" != "success" ]]; then
  echo "::error::Agent-defaults eval shards completed with '$1'."
  exit 1
fi
