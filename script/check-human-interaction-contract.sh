#!/usr/bin/env bash
# Validates the fail-closed public human-interaction contract.
set -euo pipefail

errors=0
root="$(git rev-parse --show-toplevel)"

policy="$root/packages/coordinator/.apm/skills/human-interaction-safeguard/SKILL.md"
acting="$root/packages/coordinator/.apm/skills/acting-on-behalf/SKILL.md"
feedback="$root/packages/coordinator/.apm/skills/pr-feedback-review/SKILL.md"
lifecycle="$root/packages/coordinator/.apm/skills/pr-lifecycle/SKILL.md"
agent="$root/packages/coordinator/.apm/agents/coordinator.agent.md"
tests="$root/packages/coordinator/tests/promptfooconfig.yaml"

normalize() {
  tr '\n' ' ' <"$1" | tr -s '[:space:]' ' '
}

require() {
  local file="$1" desc="$2" pattern="$3"
  if [[ ! -f "$file" ]]; then
    echo "ERROR: missing file: ${file#"$root/"}"
    errors=$((errors + 1))
    return
  fi
  if ! normalize "$file" | grep -Eiq -- "$pattern"; then
    echo "ERROR: ${file#"$root/"}: missing $desc"
    errors=$((errors + 1))
  fi
}

forbid() {
  local file="$1" desc="$2" pattern="$3"
  if normalize "$file" | grep -Eiq -- "$pattern"; then
    echo "ERROR: ${file#"$root/"}: prohibited $desc"
    errors=$((errors + 1))
  fi
}

assert_eq() {
  local expected="$1" actual="$2" desc="$3"
  if [[ "$actual" != "$expected" ]]; then
    echo "ERROR: $desc: expected $expected, got $actual"
    errors=$((errors + 1))
  fi
}

classify_rest() {
  jq -r '
    if ((.user.type? // "") == "Bot")
       or (.performed_via_github_app? != null)
    then "AUTOMATION_FLOW"
    else "HUMAN_STOP"
    end
  '
}

classify_graphql() {
  jq -r '
    if ((.author.__typename? // "") == "Bot")
    then "AUTOMATION_FLOW"
    else "HUMAN_STOP"
    end
  '
}

pagination_gate() {
  jq -r '
    if (.thread_pages_complete == true)
       and (.all_comment_pages_complete == true)
       and ((.pagination_failed? // false) == false)
    then "READY_FOR_CLASSIFICATION"
    else "HUMAN_STOP"
    end
  '
}

# --- Canonical policy and authoritative metadata ---
require "$policy" "REST PR review-comment retrieval" \
  'gh api --paginate "repos/\{owner\}/\{repo\}/pulls/\{pull_number\}/comments"'
require "$policy" "REST PR review retrieval" \
  'gh api --paginate "repos/\{owner\}/\{repo\}/pulls/\{pull_number\}/reviews"'
require "$policy" "REST issue/PR comment retrieval" \
  'gh api --paginate "repos/\{owner\}/\{repo\}/issues/\{issue_number\}/comments"'
require "$policy" "GraphQL review-thread retrieval" \
  'reviewThreads\(first: 100, after: \$threadCursor\)'
require "$policy" "per-thread GraphQL comment retrieval" \
  'comments\(first: 100, after: \$commentCursor\)'
require "$policy" "thread cursor declaration" \
  '\$threadCursor: String'
require "$policy" "comment cursor declaration" \
  '\$commentCursor: String'
require "$policy" "complete nested pagination requirement" \
  'Exhaust every comment page for every thread page'
require "$policy" "incomplete pagination fails closed" \
  'pagination level is incomplete.{0,180}`HUMAN_STOP`'
require "$policy" "REST Bot classification" \
  '\.user\.type == "Bot".{0,20}`AUTOMATION_FLOW`'
require "$policy" "GitHub App classification" \
  'performed_via_github_app.{0,120}`AUTOMATION_FLOW`'
require "$policy" "GraphQL Bot classification" \
  'author\.__typename == "Bot".{0,20}`AUTOMATION_FLOW`'
require "$policy" "login is never actor evidence" \
  'Login is never classification evidence'
require "$policy" "human and unknown fail closed" \
  'missing, ambiguous, unavailable, or unverified'
require "$policy" "unconditional user-authored response" \
  'Agent-authored replies and agent-performed thread resolution are never permitted'
require "$policy" "separate implementation permission" \
  'later, separate, explicit user instruction'
require "$policy" "implementation permission excludes reply and resolution" \
  'Separate implementation permission never grants reply or resolution permission'

# --- No reply/resolve override and no interaction-initiated-change loophole ---
forbid "$policy" "HUMAN_STOP override" 'override|solely'
forbid "$policy" "phantom GraphQL app classification" \
  'GraphQL App|authoritative GitHub App identity|GraphQL.{0,160}app metadata'
forbid "$feedback" "human feedback override or solely loophole" 'override|solely'
forbid "$lifecycle" "lifecycle override or solely loophole" 'override|solely'
forbid "$acting" "HUMAN_STOP posting override" \
  'HUMAN_STOP.{0,180}(unless|override)|override.{0,180}HUMAN_STOP'
forbid "$agent" "human-thread override" \
  'thread.{0,100}override|override.{0,100}(human|HUMAN_STOP)|solely from the interaction'

require "$acting" "unconditional posting backstop" \
  'HUMAN_STOP.{0,80}unconditionally prohibits'
require "$feedback" "user-only reply and resolution" \
  'reply and thread resolution remain user-only'
require "$lifecycle" "separate implementation instruction boundary" \
  'later, separate, explicit implementation instruction'
require "$agent" "coordinator user-only reply and resolution" \
  'reply and resolution remain user-only'

# --- Deterministic actor fixtures ---
assert_eq "HUMAN_STOP" \
  "$(printf '%s' '{"user":{"login":"octocat","type":"User"},"performed_via_github_app":null}' | classify_rest)" \
  "REST human user"
assert_eq "HUMAN_STOP" \
  "$(printf '%s' '{}' | classify_rest)" \
  "REST unknown actor"
assert_eq "HUMAN_STOP" \
  "$(printf '%s' '{"user":{"login":"helper[bot]","type":"User"},"performed_via_github_app":null}' | classify_rest)" \
  "bot-like login with User metadata"
assert_eq "HUMAN_STOP" \
  "$(printf '%s' '{"user":{"login":"helper[bot]"}}' | classify_rest)" \
  "bot-like login with missing type"
assert_eq "AUTOMATION_FLOW" \
  "$(printf '%s' '{"user":{"login":"helper[bot]","type":"Bot"},"performed_via_github_app":null}' | classify_rest)" \
  "REST Bot metadata"
assert_eq "AUTOMATION_FLOW" \
  "$(printf '%s' '{"user":{"login":"octocat","type":"User"},"performed_via_github_app":{"id":1}}' | classify_rest)" \
  "REST GitHub App metadata"
assert_eq "HUMAN_STOP" \
  "$(printf '%s' '{"author":{"__typename":"User","login":"helper[bot]"}}' | classify_graphql)" \
  "GraphQL bot-like User"
assert_eq "HUMAN_STOP" \
  "$(printf '%s' '{"author":null}' | classify_graphql)" \
  "GraphQL unknown actor"
assert_eq "AUTOMATION_FLOW" \
  "$(printf '%s' '{"author":{"__typename":"Bot","login":"helper"}}' | classify_graphql)" \
  "GraphQL Bot metadata"

# --- Deterministic nested-pagination fixtures ---
assert_eq "READY_FOR_CLASSIFICATION" \
  "$(printf '%s' '{"thread_pages_complete":true,"all_comment_pages_complete":true,"pagination_failed":false}' | pagination_gate)" \
  "complete thread and comment pagination"
assert_eq "HUMAN_STOP" \
  "$(printf '%s' '{"thread_pages_complete":false,"all_comment_pages_complete":true,"pagination_failed":false}' | pagination_gate)" \
  "incomplete thread pagination"
assert_eq "HUMAN_STOP" \
  "$(printf '%s' '{"thread_pages_complete":true,"all_comment_pages_complete":false,"pagination_failed":false}' | pagination_gate)" \
  "incomplete per-thread comment pagination"
assert_eq "HUMAN_STOP" \
  "$(printf '%s' '{"thread_pages_complete":true,"all_comment_pages_complete":true,"pagination_failed":true}' | pagination_gate)" \
  "pagination request failure"

# --- Supplemental Promptfoo coverage must remain present ---
for description in \
  'human-interaction: human question stops automation' \
  'human-interaction: unknown actor fails closed as human' \
  'human-interaction: bot-like User login fails closed' \
  'human-interaction: bot-like login with missing metadata fails closed' \
  'human-interaction: authoritative REST Bot uses normal flow' \
  'human-interaction: authoritative App metadata uses normal flow' \
  'human-interaction: authoritative GraphQL Bot uses normal flow' \
  'human-interaction: GraphQL uses nested thread and comment cursors' \
  'human-interaction: incomplete GraphQL pagination fails closed' \
  'human-interaction: separate implementation permission keeps reply and resolution user-only' \
  'human-interaction: no drafted posted reply or resolution' \
  'human-interaction: acting-on-behalf enforces posting backstop'; do
  require "$tests" "Promptfoo regression: $description" "$description"
done

if [[ $errors -gt 0 ]]; then
  echo ""
  echo "FAILED: $errors human-interaction contract error(s) found."
  exit 1
fi

echo "OK: human-interaction contract is fail-closed and user-only."
