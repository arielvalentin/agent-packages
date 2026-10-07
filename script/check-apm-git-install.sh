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
    - $repository/packages/code-reviewers#$ref
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
  'packages/code-reviewers',
];

if (!Array.isArray(lock.dependencies)) {
  throw new Error(`${lockfile}: dependencies must be an array`);
}
if (lock.dependencies.length !== expectedPaths.length) {
  throw new Error(
    `${lockfile}: expected ${expectedPaths.length} dependencies, found ${lock.dependencies.length}`,
  );
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

verify_inventory() {
  local installed_root="$1"
  shift
  local expected_paths
  local actual_paths
  local relative_path
  local source_found
  expected_paths="$(mktemp "$tmpdir/expected-paths.XXXXXX")"
  actual_paths="$(mktemp "$tmpdir/actual-paths.XXXXXX")"

  if [[ ! -d "$installed_root" ]]; then
    echo "ERROR: exact-ref APM install did not create $installed_root"
    exit 1
  fi
  if [[ -n "$(find "$installed_root" -type l -print -quit)" ]]; then
    echo "ERROR: exact-ref APM install created a symlink under $installed_root"
    exit 1
  fi

  for source_root in "$@"; do
    if git -C "$repo_root" ls-tree -r "$ref" -- "$source_root" |
      grep '^120000 ' >/dev/null; then
      echo "ERROR: $source_root contains a tracked symlink at $ref"
      exit 1
    fi
    source_found=false
    while IFS= read -r source_path; do
      source_found=true
      relative_path="${source_path#"$source_root"/}"
      printf '%s\n' "$relative_path" >>"$expected_paths"
      compare_git_file "$source_path" "$installed_root/$relative_path"
    done < <(
      git -C "$repo_root" ls-tree -r --name-only "$ref" -- "$source_root"
    )
    if [[ "$source_found" != true ]]; then
      echo "ERROR: $source_root has no tracked files at $ref"
      exit 1
    fi
  done

  find "$installed_root" -type f -print |
    while IFS= read -r installed_path; do
      printf '%s\n' "${installed_path#"$installed_root"/}"
    done >"$actual_paths"
  sort -o "$expected_paths" "$expected_paths"
  sort -o "$actual_paths" "$actual_paths"

  if [[ -n "$(uniq -d "$expected_paths")" ]]; then
    echo "ERROR: package sources contain conflicting installed paths"
    uniq -d "$expected_paths"
    exit 1
  fi
  if ! diff -u "$expected_paths" "$actual_paths"; then
    echo "ERROR: installed inventory does not match $ref"
    exit 1
  fi
}

verify_content_markers() {
  local coordinator="$1"
  local implementer="$2"
  if ! grep -Fq 'inspect -> edit -> targeted validation -> final response' "$coordinator"; then
    echo "ERROR: deployed coordinator is missing the direct-work fast path"
    exit 1
  fi
  if ! grep -Fq 'artifact for bounded work' "$implementer"; then
    echo "ERROR: deployed implementer is missing bounded-work guidance"
    exit 1
  fi
}

verify_project_install() {
  local root="$1"
  local agents_root="$root/.github/agents"
  local skills_root="$root/.agents/skills"
  local lockfile="$root/apm.lock.yaml"

  verify_lock "$lockfile"
  verify_inventory \
    "$agents_root" \
    "packages/coordinator/.apm/agents" \
    "packages/development-workflow/.apm/agents" \
    "packages/code-reviewers/.apm/agents"
  verify_inventory \
    "$skills_root" \
    "packages/coordinator/.apm/skills" \
    "packages/code-reviewers/.apm/skills"
  verify_content_markers \
    "$agents_root/coordinator.agent.md" \
    "$agents_root/implementer.agent.md"
  verify_policy_assertions "$skills_root"
}

verify_global_install() {
  local home="$1"
  local agents_root="$home/.copilot/agents"
  local modules_root="$home/.apm/apm_modules/$repository/packages"
  local coordinator_skills="$modules_root/coordinator/.apm/skills"
  local reviewer_skills="$modules_root/code-reviewers/.apm/skills"
  local lockfile="$home/.apm/apm.lock.yaml"

  verify_lock "$lockfile"
  verify_inventory \
    "$agents_root" \
    "packages/coordinator/.apm/agents" \
    "packages/development-workflow/.apm/agents" \
    "packages/code-reviewers/.apm/agents"
  verify_inventory \
    "$coordinator_skills" \
    "packages/coordinator/.apm/skills"
  verify_inventory \
    "$reviewer_skills" \
    "packages/code-reviewers/.apm/skills"
  verify_content_markers \
    "$agents_root/coordinator.agent.md" \
    "$agents_root/implementer.agent.md"
  verify_policy_assertions "$coordinator_skills"
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
verify_project_install "$consumer"

global_dry_run_home="$tmpdir/global-dry-run-home"
global_home="$tmpdir/global-home"
mkdir -p "$global_dry_run_home/.apm" "$global_home/.apm"
write_manifest "$global_dry_run_home/.apm/apm.yml"
HOME="$global_dry_run_home" apm install -g --dry-run
for unexpected_path in \
  "$global_dry_run_home/.copilot" \
  "$global_dry_run_home/.agents" \
  "$global_dry_run_home/.apm/apm.lock.yaml" \
  "$global_dry_run_home/.apm/apm_modules"; do
  if [[ -e "$unexpected_path" || -L "$unexpected_path" ]]; then
    echo "ERROR: global APM dry run unexpectedly created $unexpected_path"
    exit 1
  fi
done

write_manifest "$global_home/.apm/apm.yml"
HOME="$global_home" apm install -g
verify_global_install "$global_home"

echo "OK: all package project and isolated global APM installs passed for $repository@$ref."
