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
module_skills_root="$module_root/.apm/skills"

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

git -C "$repo_root" show "$ref:packages/coordinator/.apm/agents/coordinator.agent.md" |
  cmp -s - "$module_root/.apm/agents/coordinator.agent.md"
cmp -s \
  "$module_root/.apm/agents/coordinator.agent.md" \
  "$agents_root/coordinator.agent.md"

source_skills_root="packages/coordinator/.apm/skills"
expected_skill_inventory="$tmpdir/expected-skill-inventory"
source_skill_files="$tmpdir/source-skill-files"
: >"$expected_skill_inventory"
: >"$source_skill_files"

unexpected_source_entry="$(
  git -C "$repo_root" ls-tree -r "$ref" -- "$source_skills_root" |
    grep -Ev '^100(644|755) blob ' |
    head -n 1 || true
)"
if [[ -n "$unexpected_source_entry" ]]; then
  echo "ERROR: unexpected tracked source skill entry: $unexpected_source_entry"
  exit 1
fi

source_skill_found=false
while IFS= read -r source_path; do
  source_skill_found=true
  relative_path="${source_path#"$source_skills_root"/}"
  if grep -Fqx -- "$relative_path" "$source_skill_files"; then
    echo "ERROR: duplicate tracked source skill path: $relative_path"
    exit 1
  fi
  printf '%s\n' "$relative_path" >>"$source_skill_files"
  printf 'f\t%s\n' "$relative_path" >>"$expected_skill_inventory"

  parent_path="${relative_path%/*}"
  while [[ -n "$parent_path" && "$parent_path" != "$relative_path" ]]; do
    printf 'd\t%s\n' "$parent_path" >>"$expected_skill_inventory"
    if [[ "$parent_path" == */* ]]; then
      parent_path="${parent_path%/*}"
    else
      parent_path=""
    fi
  done

  source_copy="$tmpdir/source-skill"
  git -C "$repo_root" show "$ref:$source_path" >"$source_copy"
  if ! cmp -s "$source_copy" "$module_skills_root/$relative_path"; then
    echo "ERROR: module skill differs from source: $relative_path"
    exit 1
  fi
  if ! cmp -s "$source_copy" "$skills_root/$relative_path"; then
    echo "ERROR: deployed skill differs from source: $relative_path"
    exit 1
  fi
done < <(
  git -C "$repo_root" ls-tree -r --name-only "$ref" -- "$source_skills_root"
)
if [[ "$source_skill_found" != true ]]; then
  echo "ERROR: no tracked source skills found under $source_skills_root"
  exit 1
fi
sort -u -o "$expected_skill_inventory" "$expected_skill_inventory"

verify_skill_inventory() {
  local root="$1"
  local label="$2"
  local actual_inventory="$tmpdir/$label-skill-inventory"
  local installed_path

  if [[ ! -d "$root" || -L "$root" ]]; then
    echo "ERROR: $label skill root is not a real directory: $root"
    exit 1
  fi
  if [[ -n "$(find "$root" -type l -print -quit)" ]]; then
    echo "ERROR: $label skill inventory contains a symlink"
    exit 1
  fi
  if [[ -n "$(find "$root" ! -type f ! -type d ! -type l -print -quit)" ]]; then
    echo "ERROR: $label skill inventory contains an unexpected entry"
    exit 1
  fi

  find "$root" -type f -print |
    while IFS= read -r installed_path; do
      printf 'f\t%s\n' "${installed_path#"$root"/}"
    done >"$actual_inventory"
  find "$root" -mindepth 1 -type d -print |
    while IFS= read -r installed_path; do
      printf 'd\t%s\n' "${installed_path#"$root"/}"
    done >>"$actual_inventory"
  sort -u -o "$actual_inventory" "$actual_inventory"

  if ! diff -u "$expected_skill_inventory" "$actual_inventory"; then
    echo "ERROR: $label skill inventory does not match $ref"
    exit 1
  fi
}

verify_skill_inventory "$module_skills_root" module
verify_skill_inventory "$skills_root" deployed

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
