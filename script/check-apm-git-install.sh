#!/usr/bin/env bash
set -euo pipefail

repository="${1:-}"
ref="${2:-}"
expected_apm_version="${3:-}"

if [[ -z "$repository" || -z "$ref" ]]; then
  echo "Usage: $0 <owner/repository> <git-ref> [expected-apm-version]"
  exit 2
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/agent-packages-apm-install.XXXXXX")"
trap 'rm -rf "$tmpdir"' EXIT

apm_version="$(apm --version)"
if [[ -n "$expected_apm_version" ]] &&
  [[ "$apm_version" != *"version $expected_apm_version "* ]]; then
  echo "ERROR: expected APM $expected_apm_version, got: $apm_version"
  exit 1
fi
echo "Testing with $apm_version"

write_manifest() {
  local manifest="$1"
  cat >"$manifest" <<YAML
name: exact-ref-install-check
version: 0.0.0
targets:
  - copilot
dependencies:
  apm:
    - $repository/packages/coordinator#$ref
    - $repository/packages/development-workflow#$ref
YAML
}

verify_lock() {
  local lockfile="$1"

  (
    cd "$repo_root"
    node - "$lockfile" "$repository" "$ref" <<'NODE'
const fs = require('node:fs');
const YAML = require('yaml');

const [lockfile, repository, ref] = process.argv.slice(2);
const lock = YAML.parse(fs.readFileSync(lockfile, 'utf8'));
const expectedPaths = [
  'packages/coordinator',
  'packages/development-workflow',
];

if (!Array.isArray(lock.dependencies)) {
  throw new Error(`${lockfile}: dependencies must be an array`);
}

for (const virtualPath of expectedPaths) {
  const matches = lock.dependencies.filter(
    (dependency) =>
      dependency.repo_url === repository &&
      dependency.virtual_path === virtualPath,
  );
  if (matches.length !== 1) {
    throw new Error(
      `${lockfile}: expected one ${repository}/${virtualPath} dependency, found ${matches.length}`,
    );
  }
  const dependency = matches[0];
  for (const field of ['resolved_commit', 'resolved_ref']) {
    if (dependency[field] !== ref) {
      throw new Error(
        `${lockfile}: ${virtualPath}.${field} is ${dependency[field]}, expected ${ref}`,
      );
    }
  }
}
NODE
  )
}

compare_git_file() {
  local source_path="$1"
  local installed_path="$2"

  if ! git -C "$repo_root" cat-file -e "$ref:$source_path"; then
    echo "ERROR: $source_path is not tracked at $ref"
    exit 1
  fi
  if ! git -C "$repo_root" show "$ref:$source_path" | cmp -s - "$installed_path"; then
    echo "ERROR: $installed_path does not match $source_path at $ref"
    exit 1
  fi
}

verify_policy_assertions() {
  local panel="$1"

  (
    cd "$repo_root"
    node - "$panel" <<'NODE'
const fs = require('node:fs');
const {
  parsePolicyMarkdown,
} = require('./packages/coordinator/tests/policy-assertions.cjs');

const panel = process.argv[2];
const parsed = parsePolicyMarkdown(
  fs.readFileSync(panel, 'utf8'),
  panel,
);
if (parsed.assertions.length === 0) {
  throw new Error(`${panel}: no structured policy assertions found`);
}
NODE
  )
}

verify_install() {
  local coordinator="$1"
  local implementer="$2"
  local architect="$3"
  local panel="$4"
  local lockfile="$5"

  for required_path in \
    "$coordinator" \
    "$implementer" \
    "$architect" \
    "$panel" \
    "$lockfile"; do
    if [[ ! -f "$required_path" ]]; then
      echo "ERROR: exact-ref APM install did not create $required_path"
      exit 1
    fi
  done

  verify_lock "$lockfile"
  compare_git_file \
    "packages/coordinator/.apm/agents/coordinator.agent.md" \
    "$coordinator"
  compare_git_file \
    "packages/development-workflow/.apm/agents/implementer.agent.md" \
    "$implementer"
  compare_git_file \
    "packages/development-workflow/.apm/agents/system-architect.agent.md" \
    "$architect"
  compare_git_file \
    "packages/coordinator/.apm/skills/consensus-panel/SKILL.md" \
    "$panel"

  if ! grep -Fq 'inspect -> edit -> targeted validation -> final response' "$coordinator"; then
    echo "ERROR: deployed coordinator is missing the direct-work fast path"
    exit 1
  fi
  if ! grep -Fq 'artifact for bounded work' "$implementer"; then
    echo "ERROR: deployed implementer is missing bounded-work guidance"
    exit 1
  fi
  verify_policy_assertions "$panel"
}

project_home="$tmpdir/project-home"
consumer="$tmpdir/consumer"
mkdir -p "$project_home" "$consumer"
write_manifest "$consumer/apm.yml"

(
  cd "$consumer"
  HOME="$project_home" apm install --dry-run
  HOME="$project_home" apm install
)
verify_install \
  "$consumer/.github/agents/coordinator.agent.md" \
  "$consumer/.github/agents/implementer.agent.md" \
  "$consumer/.github/agents/system-architect.agent.md" \
  "$consumer/.agents/skills/consensus-panel/SKILL.md" \
  "$consumer/apm.lock.yaml"

global_home="$tmpdir/global-home"
mkdir -p "$global_home/.apm"
write_manifest "$global_home/.apm/apm.yml"
HOME="$global_home" apm install -g
verify_install \
  "$global_home/.copilot/agents/coordinator.agent.md" \
  "$global_home/.copilot/agents/implementer.agent.md" \
  "$global_home/.copilot/agents/system-architect.agent.md" \
  "$global_home/.apm/apm_modules/$repository/packages/coordinator/.apm/skills/consensus-panel/SKILL.md" \
  "$global_home/.apm/apm.lock.yaml"

echo "OK: project and isolated global APM installs passed for $repository@$ref."
