#!/usr/bin/env bash
set -euo pipefail

repository="${1:-}"
ref="${2:-}"

if [[ -z "$repository" || -z "$ref" ]]; then
  echo "Usage: $0 <owner/repository> <git-ref>"
  exit 2
fi

tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/agent-packages-apm-install.XXXXXX")"
trap 'rm -rf "$tmpdir"' EXIT

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

  if ! grep -Fq "$ref" "$lockfile"; then
    echo "ERROR: exact-ref APM install lockfile does not pin $ref"
    exit 1
  fi
  if ! grep -Fq 'inspect -> edit -> targeted validation -> final response' "$coordinator"; then
    echo "ERROR: deployed coordinator is missing the direct-work fast path"
    exit 1
  fi
  if ! grep -Fq '```policy-assertions' "$panel"; then
    echo "ERROR: deployed consensus panel is missing structured policy assertions"
    exit 1
  fi
  if ! grep -Fq 'artifact for bounded work' "$implementer"; then
    echo "ERROR: deployed implementer is missing bounded-work guidance"
    exit 1
  fi
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
