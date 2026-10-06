#!/usr/bin/env bash
# Validates the fail-closed public human-interaction contract.
set -euo pipefail

errors=0
root="$(git rev-parse --show-toplevel)"

policy="$root/packages/coordinator/.apm/skills/human-interaction-safeguard/SKILL.md"
acting="$root/packages/coordinator/.apm/skills/acting-on-behalf/SKILL.md"
feedback="$root/packages/coordinator/.apm/skills/pr-feedback-review/SKILL.md"
lifecycle="$root/packages/coordinator/.apm/skills/pr-lifecycle/SKILL.md"
pr_review="$root/packages/coordinator/.apm/skills/pr-review-protocol/SKILL.md"
agent="$root/packages/coordinator/.apm/agents/coordinator.agent.md"
tests="$root/packages/coordinator/tests/promptfooconfig.yaml"
policy_assertions="$root/packages/coordinator/tests/policy-assertions.cjs"

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

require_test_assert() {
  local desc="$1"
  if ! awk -v desc="$desc" '
    index($0, "description: \"" desc "\"") { found = 1; in_case = 1; next }
    in_case && /- description: "/ { in_case = 0 }
    in_case && /^[[:space:]]+assert:/ { has_assert = 1 }
    in_case && /^[[:space:]]+value:/ { has_value = 1 }
    in_case && /\*policy_route/ { has_shared_assert = 1 }
    END { exit !(found && has_assert && (has_value || has_shared_assert)) }
  ' "$tests"; then
    echo "ERROR: ${tests#"$root/"}: test lacks a non-empty assertion block: $desc"
    errors=$((errors + 1))
  fi
}

require_test_policy_assertion() {
  local desc="$1" assertion_id="$2"
  if ! awk -v desc="$desc" -v assertion_id="$assertion_id" '
    index($0, "description: \"" desc "\"") { found = 1; in_case = 1 }
    in_case && found && /- description: "/ && index($0, "description: \"" desc "\"") == 0 { in_case = 0 }
    in_case { block = block $0 "\n" }
    END {
      id_ok = index(block, "assertion_id: \"" assertion_id "\"") > 0
      result_ok = index(block, "expected_result:") > 0
      allowed_ok = index(block, "expected_allowed:") > 0
      helper_ok = index(block, "*policy_route") > 0 \
        || index(block, "&policy_route") > 0
      exit !(found && id_ok && result_ok && allowed_ok && helper_ok)
    }
  ' "$tests"; then
    echo "ERROR: ${tests#"$root/"}: test lacks structured assertion $assertion_id: $desc"
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
    if ((.user.type? // "") == "User")
    then "HUMAN_STOP"
    elif ((.user.type? // "") == "Bot")
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

classify_chain() {
  jq -r '
    def automated:
      if .surface == "graphql"
      then ((.author.__typename? // "") == "Bot")
      elif (.surface == "pull_request")
        or (.surface == "issue")
        or (.surface == "pr_review_comment")
        or (.surface == "pr_review")
        or (.surface == "issue_or_pr_comment")
      then ((.user.type? // "") == "Bot")
      else false
      end;
    if (.retrieval_complete != true)
       or ((.comments? | type) != "array")
       or ((.comments | length) == 0)
    then "HUMAN_STOP"
    elif all(.comments[]; automated)
    then "AUTOMATION_FLOW"
    else "HUMAN_STOP"
    end
  '
}

actions_for_path() {
  case "$1" in
    HUMAN_STOP)
      printf '%s' "implementation_from_interaction=false draft=false post=false reply=false resolve=false"
      ;;
    AUTOMATION_FLOW)
      printf '%s' "implementation_from_interaction=allowed draft=allowed post=allowed reply=allowed resolve=allowed"
      ;;
    *)
      printf '%s' "implementation_from_interaction=false draft=false post=false reply=false resolve=false"
      ;;
  esac
}

project_issue_comment() {
  jq -c '{
    surface: "issue_or_pr_comment",
    id,
    body,
    user: {login: .user.login, type: .user.type},
    performed_via_github_app: .performed_via_github_app
  }'
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
require "$policy" "REST PR author retrieval" \
  'gh api "repos/\{owner\}/\{repo\}/pulls/\{pull_number\}"'
require "$policy" "REST issue author retrieval" \
  'gh api "repos/\{owner\}/\{repo\}/issues/\{issue_number\}"'
require "$policy" "REST PR review-comment retrieval" \
  'gh api --paginate "repos/\{owner\}/\{repo\}/pulls/\{pull_number\}/comments"'
require "$policy" "REST PR review retrieval" \
  'gh api --paginate "repos/\{owner\}/\{repo\}/pulls/\{pull_number\}/reviews"'
require "$policy" "REST issue/PR comment retrieval" \
  'gh api --paginate "repos/\{owner\}/\{repo\}/issues/\{issue_number\}/comments"'
require "$policy" "canonical REST App projection field" \
  'performed_via_github_app: \.performed_via_github_app'
require "$policy" "PR review-comment App projection" \
  'surface: "pr_review_comment".{0,240}performed_via_github_app: \.performed_via_github_app'
require "$policy" "PR review App projection" \
  'surface: "pr_review".{0,240}performed_via_github_app: \.performed_via_github_app'
require "$policy" "issue/PR comment App projection" \
  'surface: "issue_or_pr_comment".{0,240}performed_via_github_app: \.performed_via_github_app'
forbid "$policy" "aliased REST App projection field" \
  '(^|[,{[:space:]])app: \.performed_via_github_app'
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
require "$policy" "REST Bot policy reference" \
  '\{\{policy:human-interaction\.actor\.rest-bot\.result\}\}'
require "$policy" "GitHub App classification" \
  'performed_via_github_app.{0,180}(audit context|never overrides|does not change)'
require "$policy" "ordered login-blind REST algorithm" \
  'ordered REST classification algorithm.{0,160}Discard `\.user\.login` completely.{0,180}\.user\.type == "User".{0,180}\.user\.type == "Bot".{0,180}Else select `HUMAN_STOP`'
require "$policy" "login cannot override REST algorithm" \
  'must not inspect `\.user\.login` to override or reconsider'
require "$policy" "REST User policy reference" \
  '\{\{policy:human-interaction\.actor\.rest-user\.result\}\}'
require "$policy" "GraphQL Bot policy reference" \
  '\{\{policy:human-interaction\.actor\.graphql-bot\.result\}\}'
require "$policy" "login is never actor evidence" \
  'Login is never classification evidence'
require "$policy" "unknown actor policy reference" \
  '\{\{policy:human-interaction\.actor\.rest-unknown\.result\}\}'
require "$policy" "user-owned response policy reference" \
  '\{\{policy:human-interaction\.ownership\.human-stop\.result\}\}'
require "$policy" "separate implementation permission" \
  'later, separate, explicit user instruction'
require "$policy" "reply prohibition policy reference" \
  '\{\{policy:human-interaction\.action\.human-stop\.reply\.allowed\}\}'
require "$policy" "resolution prohibition policy reference" \
  '\{\{policy:human-interaction\.action\.human-stop\.resolve\.allowed\}\}'
require "$policy" "all-Bot chain policy reference" \
  '\{\{policy:human-interaction\.chain\.all-bot\.result\}\}'
require "$policy" "human-tainted chain policy reference" \
  '\{\{policy:human-interaction\.chain\.any-human\.result\}\}'
require "$policy" "interaction implementation policy reference" \
  '\{\{policy:human-interaction\.action\.human-stop\.implement\.allowed\}\}'
require "$policy" "top-level existing-item content gate" \
  'Every comment or review posted on an existing PR or issue invokes this safeguard'
require "$policy" "complete existing-item classification unit" \
  'PR or issue author plus all existing PR reviews, inline review comments and threads, and issue/PR comments'
require "$policy" "all-Bot existing-item policy reference" \
  '\{\{policy:human-interaction\.existing-item\.all-bot\.result\}\}'
require "$policy" "human existing-item policy reference" \
  '\{\{policy:human-interaction\.existing-item\.any-human\.result\}\}'
require "$root/packages/coordinator/README.md" "README authoritative Bot classification" \
  'authoritative Bot actor metadata may continue'
require "$root/packages/coordinator/README.md" "README App metadata non-override" \
  'GitHub App association alone never overrides a User or unknown actor classification'

# --- No reply/resolve override and no interaction-initiated-change loophole ---
forbid "$policy" "HUMAN_STOP override" \
  '(may|can|should) override|override (is|remains) (allowed|permitted)|solely'
forbid "$policy" "phantom GraphQL app classification" \
  'GraphQL App|authoritative GitHub App identity|GraphQL.{0,160}app metadata'
forbid "$feedback" "human feedback override or solely loophole" 'override|solely'
forbid "$lifecycle" "lifecycle override or solely loophole" 'override|solely'
forbid "$lifecycle" "Phase 5 app-only automation selector" \
  'user\.type == "Bot" or \.performed_via_github_app != null'
require "$lifecycle" "Phase 5 detection-only boundary" \
  'This is candidate detection only'
require "$lifecycle" "Phase 5 deferral to Phase 6" \
  'proceed to Phase 6'
require "$lifecycle" "complete retrieval before classification or action" \
  'Before any classification or action, retrieve PR review comments'
require "$lifecycle" "incomplete lifecycle retrieval failing closed" \
  'Incomplete, failed, or unverifiable retrieval makes the relevant chain `HUMAN_STOP`'
require "$lifecycle" "complete chain taint before review handling" \
  'Only after complete retrieval, apply the thread/chain taint rule'
require "$lifecycle" "feedback protocol before fix loop" \
  'use `pr-feedback-review`.{0,100}may then enter `review-fix-loop`'
forbid "$acting" "HUMAN_STOP posting override" \
  'HUMAN_STOP.{0,180}(unless|override)|override.{0,180}HUMAN_STOP'
forbid "$agent" "human-thread override" \
  'thread.{0,100}override|override.{0,100}(human|HUMAN_STOP)|solely from the interaction'

require "$acting" "unconditional posting backstop" \
  'HUMAN_STOP.{0,80}unconditionally prohibits'
require "$acting" "canonical reply permission reference" \
  '\{\{policy:human-interaction\.action\.human-stop\.reply\.allowed\}\}'
require "$acting" "all existing PR and issue content uses human safeguard" \
  'Every comment or review on an existing PR or issue uses this backstop'
require "$pr_review" "PR review protocol invokes human safeguard before drafting" \
  'Before compiling or posting a review on the existing PR, invoke `human-interaction-safeguard`'
require "$pr_review" "human PR context prevents agent-authored review" \
  'HUMAN_STOP.{0,100}do not draft or post an agent-authored review'
require "$feedback" "user-only reply and resolution" \
  'reply and thread resolution remain user-only'
require "$feedback" "canonical implementation permission reference" \
  '\{\{policy:human-interaction\.action\.human-stop\.implement\.allowed\}\}'
require "$lifecycle" "separate implementation instruction boundary" \
  'later, separate, explicit implementation instruction'
require "$agent" "coordinator user-only reply and resolution" \
  'reply and resolution remain user-only'
require "$feedback" "feedback chain taint deferral" \
  'any `HUMAN_STOP` item taints the whole chain'
require "$lifecycle" "lifecycle chain taint rule" \
  'Any `HUMAN_STOP` item taints the entire chain'
require "$lifecycle" "canonical incomplete-chain reference" \
  '\{\{policy:human-interaction\.chain\.incomplete\.result\}\}'
require "$agent" "coordinator chain taint fallback" \
  'Treat the entire chain as `HUMAN_STOP`'

# --- Minimal append-only disclaimer ---
assert_eq '> _AI Assisted._' \
  "$(grep '^> _AI' "$acting")" \
  "exact disclaimer footer"
require "$acting" "unchanged disclosure conditions" \
  'uses_personal_credentials OR explicitly_attributes_user'
require "$acting" "known-service omission" \
  'Bot, app, or service credentials with no user attribution: \*\*No\*\*'
require "$acting" "unknown publisher pauses" \
  'Unknown credential/account provenance: \*\*Pause and ask before posting\*\*'
require "$acting" "body-preserving final footer" \
  'preserve the supplied substantive body, then append a blank line and the exact footer below as the final paragraph of the agent-composed body'
require "$acting" "fixing SHA before footer" \
  'include the related commit SHA.{0,100}before the disclaimer'
require "$acting" "slash command stays first" \
  'keep the slash command as the exact first line'
require "$acting" "no lookup solely for footer" \
  'Do not look up a username, model, or provider solely to render the disclaimer'

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
  "$(printf '%s' '{"user":{"login":"dependabot[bot]","type":"User"},"performed_via_github_app":null}' | classify_rest)" \
  "concrete dependabot-like login with User metadata"
assert_eq "HUMAN_STOP" \
  "$(printf '%s' '{"user":{"login":"helper[bot]"}}' | classify_rest)" \
  "bot-like login with missing type"
assert_eq "AUTOMATION_FLOW" \
  "$(printf '%s' '{"user":{"login":"helper[bot]","type":"Bot"},"performed_via_github_app":null}' | classify_rest)" \
  "REST Bot metadata"
assert_eq "HUMAN_STOP" \
  "$(printf '%s' '{"user":{"login":"octocat","type":"User"},"performed_via_github_app":{"id":1}}' | classify_rest)" \
  "REST human user with GitHub App association"
projected_app_item="$(
  printf '%s' '{"id":7,"body":"automated","user":{"login":"service","type":"User"},"performed_via_github_app":{"id":1}}' |
    project_issue_comment
)"
assert_eq "HUMAN_STOP" \
  "$(printf '%s' "$projected_app_item" | classify_rest)" \
  "projected REST human user with GitHub App association"
assert_eq "AUTOMATION_FLOW" \
  "$(printf '%s' '{"user":{"login":"service[bot]","type":"Bot"},"performed_via_github_app":{"id":1}}' | classify_rest)" \
  "REST Bot with GitHub App association"
assert_eq "HUMAN_STOP" \
  "$(printf '%s' '{"author":{"__typename":"User","login":"helper[bot]"}}' | classify_graphql)" \
  "GraphQL bot-like User"
assert_eq "HUMAN_STOP" \
  "$(printf '%s' '{"author":null}' | classify_graphql)" \
  "GraphQL unknown actor"
assert_eq "AUTOMATION_FLOW" \
  "$(printf '%s' '{"author":{"__typename":"Bot","login":"helper"}}' | classify_graphql)" \
  "GraphQL Bot metadata"

# --- Deterministic thread/chain taint fixtures ---
assert_eq "AUTOMATION_FLOW" \
  "$(printf '%s' '{"retrieval_complete":true,"comments":[{"surface":"graphql","author":{"__typename":"Bot"}},{"surface":"graphql","author":{"__typename":"Bot"}}]}' | classify_chain)" \
  "all-Bot thread"
assert_eq "HUMAN_STOP" \
  "$(printf '%s' '{"retrieval_complete":true,"comments":[{"surface":"graphql","author":{"__typename":"Bot"}},{"surface":"graphql","author":{"__typename":"User"}}]}' | classify_chain)" \
  "Bot root with User reply"
assert_eq "implementation_from_interaction=false draft=false post=false reply=false resolve=false" \
  "$(actions_for_path "$(printf '%s' '{"retrieval_complete":true,"comments":[{"surface":"graphql","author":{"__typename":"Bot"}},{"surface":"graphql","author":{"__typename":"User"}}]}' | classify_chain)")" \
  "Bot root with User reply prohibited actions"
assert_eq "HUMAN_STOP" \
  "$(printf '%s' '{"retrieval_complete":true,"comments":[{"surface":"graphql","author":{"__typename":"Bot"}},{"surface":"graphql","author":null}]}' | classify_chain)" \
  "Bot root with unknown reply"
assert_eq "implementation_from_interaction=false draft=false post=false reply=false resolve=false" \
  "$(actions_for_path "$(printf '%s' '{"retrieval_complete":true,"comments":[{"surface":"graphql","author":{"__typename":"Bot"}},{"surface":"graphql","author":null}]}' | classify_chain)")" \
  "Bot root with unknown reply prohibited actions"
assert_eq "HUMAN_STOP" \
  "$(printf '%s' '{"retrieval_complete":false,"comments":[{"surface":"graphql","author":{"__typename":"Bot"}}]}' | classify_chain)" \
  "incomplete all-Bot thread"
assert_eq "implementation_from_interaction=false draft=false post=false reply=false resolve=false" \
  "$(actions_for_path "$(printf '%s' '{"retrieval_complete":false,"comments":[{"surface":"graphql","author":{"__typename":"Bot"}}]}' | classify_chain)")" \
  "incomplete thread prohibited actions"
assert_eq "HUMAN_STOP" \
  "$(printf '%s' '{"retrieval_complete":true,"comments":[{"surface":"pull_request","user":{"type":"User"}},{"surface":"issue_or_pr_comment","user":{"type":"Bot"}}]}' | classify_chain)" \
  "top-level review with human PR author"
assert_eq "AUTOMATION_FLOW" \
  "$(printf '%s' '{"retrieval_complete":true,"comments":[{"surface":"pull_request","user":{"type":"Bot"}},{"surface":"pr_review","user":{"type":"Bot"}},{"surface":"issue_or_pr_comment","user":{"type":"Bot"}},{"surface":"graphql","author":{"__typename":"Bot"}}]}' | classify_chain)" \
  "all-Bot existing PR context"
assert_eq "implementation_from_interaction=allowed draft=allowed post=allowed reply=allowed resolve=allowed" \
  "$(actions_for_path "$(printf '%s' '{"retrieval_complete":true,"comments":[{"surface":"pull_request","user":{"type":"Bot"}},{"surface":"pr_review","user":{"type":"Bot"}},{"surface":"issue_or_pr_comment","user":{"type":"Bot"}},{"surface":"graphql","author":{"__typename":"Bot"}}]}' | classify_chain)")" \
  "all-Bot existing PR structured actions"
assert_eq "AUTOMATION_FLOW" \
  "$(printf '%s' '{"retrieval_complete":true,"comments":[{"surface":"issue","user":{"type":"Bot"}},{"surface":"issue_or_pr_comment","user":{"type":"Bot"}}]}' | classify_chain)" \
  "all-Bot existing issue context"

# --- Authoritative structured assertion validation ---
if ! bash "$root/script/check-policy-assertions.sh"; then
  echo "ERROR: structured policy assertion validation failed"
  errors=$((errors + 1))
fi

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
  'human-interaction: User with REST App association stays human' \
  'human-interaction: authoritative GraphQL Bot uses normal flow' \
  'human-interaction: GraphQL uses nested thread and comment cursors' \
  'human-interaction: incomplete GraphQL pagination fails closed' \
  'human-interaction: Bot root with User reply taints thread' \
  'human-interaction: Bot root with unknown reply taints thread' \
  'human-interaction: Bot root with User reply keeps response user-only' \
  'human-interaction: Bot root with unknown reply keeps response user-only' \
  'human-interaction: top-level review classifies complete existing PR' \
  'human-interaction: unknown existing PR participant stops review flow' \
  'human-interaction: all-Bot existing PR allows top-level review flow' \
  'human-interaction: all-Bot existing issue allows top-level comment flow' \
  'human-interaction: human existing issue stops top-level comment flow' \
  'human-interaction: unknown existing issue participant stops comment flow' \
  'human-interaction: tainted thread reply and resolution stay user-only' \
  'human-interaction: separate implementation permission keeps reply and resolution user-only' \
  'human-interaction: tainted-thread drafting is prohibited' \
  'human-interaction: acting-on-behalf enforces posting backstop' \
  'acting-on-behalf: top-level existing PR review uses human gate' \
  'pr-review-protocol: existing PR review requires human safeguard' \
  'pr-review-protocol: human PR context stops agent review'; do
  require "$tests" "Promptfoo regression: $description" "$description"
  require_test_assert "$description"
done

require "$policy" "six-decision HUMAN_STOP response contract" \
  'Classification: HUMAN_STOP Implement: No Draft: No Post: No Reply: No Resolve: No'
require "$policy" "six-decision AUTOMATION_FLOW response contract" \
  'Classification: AUTOMATION_FLOW Implement: Allowed Draft: Allowed Post: Allowed Reply: Allowed Resolve: Allowed'
require "$policy" "Yes/No HUMAN_STOP permission response" \
  'for `HUMAN_STOP`, return exactly `No`'
require "$root/packages/coordinator/tests/policy-assertions.test.cjs" \
  "structured action helper unit coverage" \
  'assert-structured-actions\.cjs'
require "$tests" "shared structured policy assertion anchor" \
  '&policy_route'
require "$tests" "shared structured policy assertion helper call" \
  'file://assert-policy-route\.cjs'
require "$policy_assertions" "policy assertion fence parser" \
  'policy-assertions'
require "$policy_assertions" "duplicate key rejection" \
  'duplicate key'
require "$policy_assertions" "linked contradiction rejection" \
  'linked result contradicts'
require "$policy_assertions" "unknown enum rejection" \
  'unknown \$\{field\} enum'
forbid "$tests" "last-match HUMAN_STOP assertions" \
  "lastIndexOf\\('HUMAN_STOP'\\)"

for description in \
  'human-interaction: human directive does not trigger automatic implementation' \
  'human-interaction: human suggestion stops automation' \
  'human-interaction: unknown actor fails closed as human' \
  'human-interaction: bot-like User login fails closed' \
  'human-interaction: bot-like login with missing metadata fails closed' \
  'human-interaction: User with REST App association stays human' \
  'human-interaction: incomplete GraphQL pagination fails closed' \
  'human-interaction: Bot root with User reply taints thread' \
  'human-interaction: Bot root with unknown reply taints thread' \
  'human-interaction: top-level review classifies complete existing PR' \
  'human-interaction: unknown existing PR participant stops review flow' \
  'human-interaction: unknown existing issue participant stops comment flow'; do
  case "$description" in
    'human-interaction: unknown actor fails closed as human'|'human-interaction: bot-like login with missing metadata fails closed')
      assertion_id='human-interaction.actor.rest-unknown'
      ;;
    'human-interaction: User with REST App association stays human')
      assertion_id='human-interaction.provenance.user-with-app'
      ;;
    'pr-lifecycle: Bot root with unknown reply stops action'|'human-interaction: Bot root with unknown reply taints thread')
      assertion_id='human-interaction.chain.any-unknown'
      ;;
    'human-interaction: incomplete GraphQL pagination fails closed')
      assertion_id='human-interaction.chain.incomplete'
      ;;
    'human-interaction: top-level review classifies complete existing PR')
      assertion_id='human-interaction.existing-item.any-human'
      ;;
    'human-interaction: unknown existing PR participant stops review flow')
      assertion_id='human-interaction.existing-item.any-unknown'
      ;;
    'human-interaction: unknown existing issue participant stops comment flow')
      assertion_id='human-interaction.existing-issue.any-unknown'
      ;;
    'pr-lifecycle: Bot root with User reply stops action'|'human-interaction: Bot root with User reply taints thread')
      assertion_id='human-interaction.chain.any-human'
      ;;
    *)
      assertion_id='human-interaction.actor.rest-user'
      ;;
  esac
  require_test_policy_assertion "$description" "$assertion_id"
done

if [[ $errors -gt 0 ]]; then
  echo ""
  echo "FAILED: $errors human-interaction contract error(s) found."
  exit 1
fi

echo "OK: human-interaction contract is fail-closed and user-only."
