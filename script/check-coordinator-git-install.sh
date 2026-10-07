#!/usr/bin/env bash
set -euo pipefail

repository="${1:-}"
ref="${2:-}"

if [[ -z "$repository" || ! "$ref" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Usage: $0 <owner/repository> <commit-sha>"
  exit 2
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/coordinator-apm-install.XXXXXX")"
trap 'rm -rf "$tmpdir"' EXIT

consumer="$tmpdir/consumer"
dry_run_home="$tmpdir/dry-run-home"
install_home="$tmpdir/install-home"
mkdir -p "$consumer" "$dry_run_home" "$install_home"

cat >"$consumer/apm.yml" <<YAML
name: coordinator-exact-ref-install-check
version: 0.0.0
targets:
  - copilot
dependencies:
  apm:
    - $repository/packages/coordinator#$ref
YAML

if git -C "$repo_root" cat-file -e "$ref:packages/coordinator/apm" 2>/dev/null; then
  echo "ERROR: legacy packages/coordinator/apm alias is tracked at $ref"
  exit 1
fi

(
  cd "$consumer"
  HOME="$dry_run_home" apm install --dry-run
)
for path in apm.lock.yaml apm_modules .github .agents; do
  if [[ -e "$consumer/$path" || -L "$consumer/$path" ]]; then
    echo "ERROR: coordinator dry run created $consumer/$path"
    exit 1
  fi
done

(
  cd "$consumer"
  HOME="$install_home" apm install
)

lockfile="$consumer/apm.lock.yaml"
module_root="$consumer/apm_modules/$repository/packages/coordinator"
agents_root="$consumer/.github/agents"
skills_root="$consumer/.agents/skills"

node - "$lockfile" "$repository" "$ref" <<'NODE'
const fs = require('node:fs');

const [lockfile, repository, ref] = process.argv.slice(2);
const lines = fs.readFileSync(lockfile, 'utf8').split(/\r?\n/);
const dependencies = [];
let dependency;

for (const line of lines) {
  const start = line.match(/^- repo_url:\s*(.+)$/);
  if (start) {
    dependency = { repo_url: start[1] };
    dependencies.push(dependency);
    continue;
  }
  const field = line.match(/^  ([a-z_]+):\s*(.*)$/);
  if (dependency && field) dependency[field[1]] = field[2];
}

if (dependencies.length !== 1) {
  throw new Error(`${lockfile}: expected one dependency, found ${dependencies.length}`);
}

const actual = dependencies[0];
const expected = {
  repo_url: repository,
  virtual_path: 'packages/coordinator',
  resolved_commit: ref,
  resolved_ref: ref,
};
for (const [field, value] of Object.entries(expected)) {
  if (actual[field] !== value) {
    throw new Error(`${lockfile}: ${field} is ${actual[field]}, expected ${value}`);
  }
}
NODE

if [[ ! -f "$agents_root/coordinator.agent.md" ]]; then
  echo "ERROR: coordinator agent was not deployed"
  exit 1
fi
if [[ ! -f "$module_root/.apm/agents/coordinator.agent.md" ]]; then
  echo "ERROR: coordinator module content was not installed"
  exit 1
fi
agent_count="$(find "$agents_root" -type f -name '*.agent.md' | wc -l | tr -d ' ')"
if [[ "$agent_count" != 1 ]]; then
  echo "ERROR: expected one deployed coordinator agent, found $agent_count"
  exit 1
fi

skill_count="$(find "$skills_root" -mindepth 2 -maxdepth 2 -type f -name SKILL.md | wc -l | tr -d ' ')"
if [[ "$skill_count" != 12 ]]; then
  echo "ERROR: expected 12 deployed coordinator skills, found $skill_count"
  exit 1
fi
for skill in consensus-panel human-interaction-safeguard review-fix-loop; do
  if [[ ! -f "$skills_root/$skill/SKILL.md" ]]; then
    echo "ERROR: representative coordinator skill $skill was not deployed"
    exit 1
  fi
done

git -C "$repo_root" show "$ref:packages/coordinator/.apm/agents/coordinator.agent.md" |
  cmp -s - "$module_root/.apm/agents/coordinator.agent.md"
cmp -s \
  "$module_root/.apm/agents/coordinator.agent.md" \
  "$agents_root/coordinator.agent.md"
git -C "$repo_root" show "$ref:packages/coordinator/.apm/skills/consensus-panel/SKILL.md" |
  cmp -s - "$skills_root/consensus-panel/SKILL.md"

for path in \
  "$module_root/apm" \
  "$consumer/apm" \
  "$consumer/.github/apm" \
  "$consumer/.agents/apm"; do
  if [[ -e "$path" || -L "$path" ]]; then
    echo "ERROR: legacy coordinator apm alias was installed at $path"
    exit 1
  fi
done

echo "OK: coordinator project install passed for $repository@$ref."
