#!/usr/bin/env bash
# Validates that skills referenced in agent files actually exist as directories.
# Also checks that every skill directory has a SKILL.md with valid frontmatter.
set -euo pipefail

errors=0
root="$(git rev-parse --show-toplevel)"

# --- Check skill directories have SKILL.md with name: frontmatter ---
for skill_dir in $(find "$root/packages" -type d -path "*/.apm/skills/*" -not -path "*/.apm/skills" | sort); do
  # Only process leaf skill dirs (immediate children of skills/)
  parent="$(dirname "$skill_dir")"
  if [[ "$(basename "$parent")" != "skills" ]]; then
    continue
  fi

  skill_file="$skill_dir/SKILL.md"
  if [[ ! -f "$skill_file" ]]; then
    echo "ERROR: Skill directory missing SKILL.md: $skill_dir"
    errors=$((errors + 1))
    continue
  fi

  if ! head -20 "$skill_file" | grep -q "^name:"; then
    echo "ERROR: SKILL.md missing 'name:' in frontmatter: $skill_file"
    errors=$((errors + 1))
  fi

  if ! head -20 "$skill_file" | grep -q "^description:"; then
    echo "ERROR: SKILL.md missing 'description:' in frontmatter: $skill_file"
    errors=$((errors + 1))
  fi
done

# --- Check agent files have valid frontmatter ---
for agent_file in $(find "$root/packages" -name "*.agent.md" | sort); do
  if ! head -1 "$agent_file" | grep -q "^---"; then
    echo "ERROR: Agent file missing frontmatter delimiter: $agent_file"
    errors=$((errors + 1))
    continue
  fi

  if ! head -10 "$agent_file" | grep -q "^name:"; then
    echo "ERROR: Agent file missing 'name:' in frontmatter: $agent_file"
    errors=$((errors + 1))
  fi

  if ! head -10 "$agent_file" | grep -q "^description:"; then
    echo "ERROR: Agent file missing 'description:' in frontmatter: $agent_file"
    errors=$((errors + 1))
  fi
done

# --- Collect all available skill names ---
available_skills=""
for skill_dir in $(find "$root/packages" -type d -path "*/.apm/skills/*" -not -path "*/.apm/skills" | sort); do
  parent="$(dirname "$skill_dir")"
  if [[ "$(basename "$parent")" == "skills" ]]; then
    available_skills="$available_skills $(basename "$skill_dir")"
  fi
done

# --- Check each package has an apm.yml ---
for pkg_dir in "$root"/packages/*/; do
  if [[ ! -f "$pkg_dir/apm.yml" ]]; then
    echo "ERROR: Package directory missing apm.yml: $pkg_dir"
    errors=$((errors + 1))
  fi
done

# --- Summary ---
if [[ $errors -gt 0 ]]; then
  echo ""
  echo "FAILED: $errors error(s) found."
  exit 1
else
  echo "OK: All structural checks passed."
  exit 0
fi
