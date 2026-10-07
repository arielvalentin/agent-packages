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

compare_git_tree() {
  local source_root="$1"
  local installed_root="$2"
  local found=false

  while IFS= read -r source_path; do
    found=true
    compare_git_file \
      "$source_path" \
      "$installed_root/${source_path#"$source_root"/}"
  done < <(git -C "$repo_root" ls-tree -r --name-only "$ref" -- "$source_root")

  if [[ "$found" != true ]]; then
    echo "ERROR: $source_root has no tracked files at $ref"
    exit 1
  fi
}

verify_policy_assertions() {
  local skills_root="$1"

  (
    cd "$repo_root"
    node - "$skills_root" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const {
  parsePolicyMarkdown,
} = require('./packages/coordinator/tests/policy-assertions.cjs');

const skillsRoot = process.argv[2];
let assertionCount = 0;
for (const entry of fs.readdirSync(skillsRoot, { recursive: true })) {
  const file = path.join(skillsRoot, entry);
  if (!entry.endsWith('.md') || !fs.statSync(file).isFile()) continue;
  const parsed = parsePolicyMarkdown(fs.readFileSync(file, 'utf8'), file);
  assertionCount += parsed.assertions.length;
}
if (assertionCount === 0) {
  throw new Error(`${skillsRoot}: no structured policy assertions found`);
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
  local coordinator_agents_root
  local development_agents_root
  local coordinator_skills_root
  coordinator_agents_root="$(dirname "$coordinator")"
  development_agents_root="$(dirname "$implementer")"
  coordinator_skills_root="$(dirname "$(dirname "$panel")")"

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
  compare_git_tree \
    "packages/coordinator/.apm/agents" \
    "$coordinator_agents_root"
  compare_git_tree \
    "packages/development-workflow/.apm/agents" \
    "$development_agents_root"
  compare_git_tree \
    "packages/coordinator/.apm/skills" \
    "$coordinator_skills_root"

  if ! grep -Fq 'inspect -> edit -> targeted validation -> final response' "$coordinator"; then
    echo "ERROR: deployed coordinator is missing the direct-work fast path"
    exit 1
  fi
  if ! grep -Fq 'artifact for bounded work' "$implementer"; then
    echo "ERROR: deployed implementer is missing bounded-work guidance"
    exit 1
  fi
  verify_policy_assertions "$coordinator_skills_root"
}

dry_run_home="$tmpdir/dry-run-home"
project_home="$tmpdir/project-home"
consumer="$tmpdir/consumer"
mkdir -p "$dry_run_home" "$project_home" "$consumer"
write_manifest "$consumer/apm.yml"

(
  cd "$consumer"
  HOME="$dry_run_home" apm install --dry-run
  for unexpected_path in apm.lock.yaml apm_modules .agents .github; do
    if [[ -e "$unexpected_path" ]]; then
      echo "ERROR: APM dry run unexpectedly created $unexpected_path"
      exit 1
    fi
  done
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
