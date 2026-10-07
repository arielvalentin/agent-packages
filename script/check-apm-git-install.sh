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
  local allowed_extra=""
  if [[ "${1:-}" == --allow=* ]]; then
    allowed_extra="${1#--allow=}"
    shift
  fi
  local expected_paths
  local actual_paths
  local parent_path
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
      printf 'f\t%s\n' "$relative_path" >>"$expected_paths"
      parent_path="${relative_path%/*}"
      while [[ -n "$parent_path" && "$parent_path" != "$relative_path" ]]; do
        printf 'd\t%s\n' "$parent_path" >>"$expected_paths"
        if [[ "$parent_path" == */* ]]; then
          parent_path="${parent_path%/*}"
        else
          parent_path=""
        fi
      done
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
      relative_path="${installed_path#"$installed_root"/}"
      if [[ "$relative_path" != "$allowed_extra" ]]; then
        printf 'f\t%s\n' "$relative_path"
      fi
    done >"$actual_paths"
  find "$installed_root" -mindepth 1 -type d -print |
    while IFS= read -r installed_path; do
      printf 'd\t%s\n' "${installed_path#"$installed_root"/}"
    done >>"$actual_paths"
  sort -u -o "$expected_paths" "$expected_paths"
  sort -u -o "$actual_paths" "$actual_paths"
  if ! diff -u "$expected_paths" "$actual_paths"; then
    echo "ERROR: installed inventory does not match $ref"
    exit 1
  fi
}

verify_module_inventory() {
  local package="$1"
  local module_root="$2"
  local pin="$module_root/.apm-pin"

  if [[ ! -f "$pin" || -L "$pin" ]]; then
    echo "ERROR: module store is missing regular pin file $pin"
    exit 1
  fi
  node - "$pin" "$ref" <<'NODE'
const fs = require('node:fs');
const [pin, ref] = process.argv.slice(2);
const metadata = JSON.parse(fs.readFileSync(pin, 'utf8'));
if (metadata.schema_version !== 1 || metadata.resolved_commit !== ref) {
  throw new Error(`${pin}: invalid module pin for ${ref}`);
}
NODE
  verify_inventory \
    "$module_root" \
    --allow=.apm-pin \
    "packages/$package"
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
  local modules_root="$root/apm_modules/$repository/packages"
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
  verify_module_inventory \
    "coordinator" \
    "$modules_root/coordinator"
  verify_module_inventory \
    "development-workflow" \
    "$modules_root/development-workflow"
  verify_module_inventory \
    "code-reviewers" \
    "$modules_root/code-reviewers"
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
  local lockfile="$home/.apm/apm.lock.yaml"

  verify_lock "$lockfile"
  verify_inventory \
    "$agents_root" \
    "packages/coordinator/.apm/agents" \
    "packages/development-workflow/.apm/agents" \
    "packages/code-reviewers/.apm/agents"
  verify_module_inventory \
    "coordinator" \
    "$modules_root/coordinator"
  verify_module_inventory \
    "development-workflow" \
    "$modules_root/development-workflow"
  verify_module_inventory \
    "code-reviewers" \
    "$modules_root/code-reviewers"
  verify_content_markers \
    "$agents_root/coordinator.agent.md" \
    "$agents_root/implementer.agent.md"
  verify_policy_assertions "$coordinator_skills"
}

verify_global_skill_placeholders() {
  local skills_root="$1"
  local expected_skills
  local actual_skills
  local relative_path
  expected_skills="$(mktemp "$tmpdir/expected-skills.XXXXXX")"
  actual_skills="$(mktemp "$tmpdir/actual-skills.XXXXXX")"

  if [[ ! -d "$skills_root" ]]; then
    echo "ERROR: global APM install did not create $skills_root"
    exit 1
  fi
  if [[ -n "$(find "$skills_root" \( -type f -o -type l \) -print -quit)" ]]; then
    echo "ERROR: partial Copilot user scope unexpectedly exposed skill files"
    exit 1
  fi
  if [[ -n "$(find "$skills_root" -mindepth 2 -type d -print -quit)" ]]; then
    echo "ERROR: partial Copilot user scope created nested skill directories"
    exit 1
  fi

  for source_root in \
    "packages/coordinator/.apm/skills" \
    "packages/code-reviewers/.apm/skills"; do
    while IFS= read -r source_path; do
      relative_path="${source_path#"$source_root"/}"
      printf '%s\n' "${relative_path%%/*}" >>"$expected_skills"
    done < <(
      git -C "$repo_root" ls-tree -r --name-only "$ref" -- "$source_root"
    )
  done
  find "$skills_root" -mindepth 1 -maxdepth 1 -type d -print |
    while IFS= read -r skill_path; do
      printf '%s\n' "${skill_path##*/}"
    done >"$actual_skills"
  sort -u -o "$expected_skills" "$expected_skills"
  sort -u -o "$actual_skills" "$actual_skills"

  if ! diff -u "$expected_skills" "$actual_skills"; then
    echo "ERROR: global skill placeholders do not match $ref"
    exit 1
  fi
}

verify_global_skills() {
  local skills_root="$1"

  case "$expected_apm_version" in
    0.32.*)
      verify_global_skill_placeholders "$skills_root"
      ;;
    0.33.*)
      verify_inventory \
        "$skills_root" \
        "packages/coordinator/.apm/skills" \
        "packages/code-reviewers/.apm/skills"
      verify_policy_assertions "$skills_root"
      ;;
    "")
      if [[ -n "$(find "$skills_root" -type f -print -quit)" ]]; then
        verify_inventory \
          "$skills_root" \
          "packages/coordinator/.apm/skills" \
          "packages/code-reviewers/.apm/skills"
        verify_policy_assertions "$skills_root"
      else
        verify_global_skill_placeholders "$skills_root"
      fi
      ;;
    *)
      echo "ERROR: unsupported expected APM version $expected_apm_version"
      exit 1
      ;;
  esac
}

assert_absent() {
  local context="$1"
  shift
  for forbidden_path in "$@"; do
    if [[ -e "$forbidden_path" || -L "$forbidden_path" ]]; then
      echo "ERROR: $context unexpectedly created $forbidden_path"
      exit 1
    fi
  done
}

dry_run_home="$tmpdir/dry-run-home"
project_home="$tmpdir/project-home"
consumer="$tmpdir/consumer"
mkdir -p "$dry_run_home" "$project_home" "$consumer"
write_manifest "$consumer/apm.yml"

(
  cd "$consumer"
  HOME="$dry_run_home" apm install --dry-run
  assert_absent \
    "project APM dry run" \
    apm.lock.yaml \
    apm_modules \
    .agents \
    .github
  assert_absent \
    "project APM dry run in HOME" \
    "$dry_run_home/.copilot" \
    "$dry_run_home/.agents" \
    "$dry_run_home/.apm/apm.lock.yaml" \
    "$dry_run_home/.apm/apm_modules"
  HOME="$project_home" apm install
)
verify_project_install "$consumer"
assert_absent \
  "project APM install in project scope" \
  "$consumer/.copilot" \
  "$consumer/.apm" \
  "$consumer/apm"
assert_absent \
  "project APM install in HOME" \
  "$project_home/.copilot" \
  "$project_home/.agents" \
  "$project_home/.apm/apm.lock.yaml" \
  "$project_home/.apm/apm_modules"

global_dry_run_home="$tmpdir/global-dry-run-home"
global_dry_run_work="$tmpdir/global-dry-run-work"
global_home="$tmpdir/global-home"
global_work="$tmpdir/global-work"
mkdir -p \
  "$global_dry_run_home/.apm" \
  "$global_dry_run_work" \
  "$global_home/.apm" \
  "$global_work"
write_manifest "$global_dry_run_home/.apm/apm.yml"
(
  cd "$global_dry_run_work"
  HOME="$global_dry_run_home" apm install -g --dry-run
)
assert_absent \
  "global APM dry run in HOME" \
  "$global_dry_run_home/.copilot" \
  "$global_dry_run_home/.agents" \
  "$global_dry_run_home/.apm/apm.lock.yaml" \
  "$global_dry_run_home/.apm/apm_modules"
assert_absent \
  "global APM dry run in project scope" \
  "$global_dry_run_work/.github" \
  "$global_dry_run_work/.agents" \
  "$global_dry_run_work/apm.lock.yaml" \
  "$global_dry_run_work/apm_modules"

write_manifest "$global_home/.apm/apm.yml"
(
  cd "$global_work"
  HOME="$global_home" apm install -g
)
verify_global_install "$global_home"
verify_global_skills "$global_home/.agents/skills"
assert_absent \
  "global APM install unsupported skill deployment" \
  "$global_home/.copilot/skills"
assert_absent \
  "global APM install in project scope" \
  "$global_work/.github" \
  "$global_work/.agents" \
  "$global_work/apm.lock.yaml" \
  "$global_work/apm_modules"

echo "OK: all package project and isolated global APM installs passed for $repository@$ref."
