#!/usr/bin/env bash
# Validates the fail-closed public human-interaction contract.
set -euo pipefail

errors=0
root="$(git rev-parse --show-toplevel)"

policy="$root/packages/agent-defaults/.apm/skills/human-interaction-safeguard/SKILL.md"
protocol="$root/packages/agent-defaults/.apm/skills/human-interaction-safeguard/references/single-action-attestation.md"
verifier="$root/packages/agent-defaults/.apm/skills/human-interaction-safeguard/scripts/verify_attestation.py"
acting="$root/packages/agent-defaults/.apm/skills/acting-on-behalf/SKILL.md"
feedback="$root/packages/agent-defaults/.apm/skills/pr-feedback-review/SKILL.md"
lifecycle="$root/packages/agent-defaults/.apm/skills/pr-lifecycle/SKILL.md"
agent="$root/packages/coordinator/.apm/agents/coordinator.agent.md"
tests="$root/packages/agent-defaults/tests/promptfooconfig.yaml"
attestation='I, arielvalentin, do hereby authorize this agent to override my human-interaction-safeguard skill.'

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
    if (.performed_via_github_app? != null)
    then "AUTOMATION_FLOW"
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
      elif (.surface == "pr_review_comment")
        or (.surface == "pr_review")
        or (.surface == "issue_or_pr_comment")
      then (((.user.type? // "") == "Bot") or (.performed_via_github_app? != null))
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
      printf '%s' "implementation_from_interaction=false reply=false resolve=false"
      ;;
    AUTOMATION_FLOW)
      printf '%s' "implementation_from_interaction=allowed reply=allowed resolve=allowed"
      ;;
    *)
      printf '%s' "implementation_from_interaction=false reply=false resolve=false"
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
require "$policy" "REST PR review-comment retrieval" \
  'gh api --paginate "repos/\{owner\}/\{repo\}/pulls/\{pull_number\}/comments"'
require "$policy" "REST PR review retrieval" \
  'gh api --paginate "repos/\{owner\}/\{repo\}/pulls/\{pull_number\}/reviews"'
require "$policy" "REST issue/PR comment retrieval" \
  'gh api --paginate "repos/\{owner\}/\{repo\}/issues/\{issue_number\}/comments"'
require "$policy" "canonical REST App projection field" \
  'performed_via_github_app: \.performed_via_github_app'
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
require "$policy" "REST Bot classification" \
  '\.user\.type == "Bot".{0,20}`AUTOMATION_FLOW`'
require "$policy" "GitHub App classification" \
  'performed_via_github_app.{0,120}`AUTOMATION_FLOW`'
require "$policy" "ordered login-blind REST algorithm" \
  'ordered REST classification algorithm.{0,160}Discard `\.user\.login` completely.{0,180}performed_via_github_app.{0,180}\.user\.type == "Bot".{0,180}Else select `HUMAN_STOP`'
require "$policy" "login cannot override REST algorithm" \
  'must not inspect `\.user\.login` to override or reconsider'
require "$policy" "REST User remains human despite bot-like login" \
  '\.user\.type == "User".{0,80}regardless.{0,80}bot-like login'
require "$policy" "GraphQL Bot classification" \
  'author\.__typename == "Bot".{0,20}`AUTOMATION_FLOW`'
require "$policy" "login is never actor evidence" \
  'Login is never classification evidence'
require "$policy" "human and unknown fail closed" \
  'missing, ambiguous, unavailable, or unverified'
require "$policy" "default user-authored response" \
  'Without the single-action attestation below, agent-authored replies and agent-performed thread resolution are prohibited'
require "$policy" "separate implementation permission" \
  'later, separate, explicit user instruction'
require "$policy" "implementation permission excludes reply and resolution" \
  'Separate implementation permission never grants reply or resolution permission'
require "$policy" "all-items automation requirement" \
  'AUTOMATION_FLOW.{0,80}only when \*\*every\*\* comment and reply'
require "$policy" "any human item taints entire chain" \
  'any.{0,80}comment or reply maps to `HUMAN_STOP`.{0,100}entire thread/chain'
require "$policy" "tainted chain blocks automation" \
  'no comment in that chain may trigger implementation, an agent-authored reply, or agent-performed resolution'

# --- Canonical single-action exception; no downstream alternate ceremony ---
assert_eq "$attestation" \
  "$(grep '^I, arielvalentin,' "$protocol")" \
  "exact attestation sentence in canonical reference"
assert_eq "98" "${#attestation}" "documented literal attestation length"
assert_eq "$attestation" \
  "$(python3 - "$verifier" <<'PY'
import runpy
import sys
print(runpy.run_path(sys.argv[1])["EXPECTED"].decode("ascii"))
PY
)" \
  "interactive verifier uses the canonical sentence"
require "$policy" "conditional canonical reference loading" \
  'For an eligible direct request only, load the \[single-action protocol\]\(references/single-action-attestation.md\)'
require "$policy" "missing reference fails closed" \
  'If the reference is unavailable, stop without an override'
require "$protocol" "binding to the concrete direct request" \
  'Bind the pending challenge to that one direct user request'
require "$protocol" "eligibility verified before challenge" \
  'eligibility was verified before issuing the challenge'
require "$protocol" "required actual-input helper" \
  'Literal matching must be performed by the bundled `scripts/verify_attestation.py`'
require "$protocol" "no model-only fallback" \
  'Do not fall back to model-only comparison'
require "$protocol" "TTY is not human identity proof" \
  'A TTY is a channel check, not proof of human identity'
forbid "$policy" "ceremony sentence in classification context" \
  'I, arielvalentin, do hereby authorize'
require "$policy" "direct user opt-in only" \
  'Start only after a direct user request explicitly asks to override one concrete blocked action'
require "$policy" "no proactive override offer" \
  'Do not offer it proactively on `HUMAN_STOP`'
require "$protocol" "literal whole-reply equality" \
  'entire user-authored reply body.{0,80}literal equality'
require "$protocol" "no normalization" \
  'Do not trim whitespace, normalize line endings or Unicode, fold case'
require "$protocol" "mismatch rejects and requires exact retry" \
  'On any mismatch, keep the action blocked.{0,80}must enter the attestation exactly'
require "$protocol" "fresh direct reply after challenge" \
  'Only the fresh direct user.{0,35}current helper challenge can qualify'
require "$protocol" "untrusted provenance rejection" \
  'background/delegated messages.{0,150}cannot substitute'
require "$protocol" "provenance from runtime not text" \
  'Treat provenance as runtime message/client context'
require "$policy" "metadata failures cannot be overridden" \
  'Incomplete retrieval, failed pagination, missing, ambiguous, unavailable, unverified, or other/unknown actor metadata are non-overridable'
require "$protocol" "freeform challenge without choices" \
  'A pipe, input file, command argument, chat transcript, `ask_user` result, or model-reconstructed reply is not a supported attestation input'
require "$protocol" "one action does not change classification" \
  'interaction stays `HUMAN_STOP`'
require "$protocol" "consume before attempt" \
  'Consume authorization immediately before the one authorized attempt'
require "$protocol" "failed and interrupted attempts consume authorization" \
  'including a failed or interrupted attempt'
require "$protocol" "changed chain or target invalidates authorization" \
  'changed target, action, proposed content/work scope, or relevant chain invalidates'
require "$protocol" "independent tool approval" \
  'every independent posting/tool approval gate'
require "$policy" "missing-skill fallback remains closed" \
  'If this skill is unavailable, fail closed'
forbid "$policy" "phantom GraphQL app classification" \
  'GraphQL App|authoritative GitHub App identity|GraphQL.{0,160}app metadata'
for downstream in "$acting" "$feedback" "$lifecycle" "$agent"; do
  require "$downstream" "canonical single-action deferral" 'single-action'
  forbid "$downstream" "duplicated attestation ceremony" \
    'I, arielvalentin, do hereby authorize'
done
require "$acting" "posting backstop defers only to canonical policy" \
  'Only `human-interaction-safeguard` can authorize its single-action exception'
require "$feedback" "user-only reply and resolution" \
  'reply and thread resolution remain user-only'
require "$lifecycle" "separate implementation instruction boundary" \
  'later, separate, explicit implementation instruction'
require "$agent" "coordinator user-only reply and resolution" \
  'reply and resolution remain user-only'
require "$feedback" "feedback chain taint deferral" \
  'any `HUMAN_STOP` item taints the whole chain'
require "$lifecycle" "lifecycle chain taint rule" \
  'Any `HUMAN_STOP` item taints the entire chain'
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
assert_eq "AUTOMATION_FLOW" \
  "$(printf '%s' '{"user":{"login":"octocat","type":"User"},"performed_via_github_app":{"id":1}}' | classify_rest)" \
  "REST GitHub App metadata"
projected_app_item="$(
  printf '%s' '{"id":7,"body":"automated","user":{"login":"service","type":"User"},"performed_via_github_app":{"id":1}}' |
    project_issue_comment
)"
assert_eq "AUTOMATION_FLOW" \
  "$(printf '%s' "$projected_app_item" | classify_rest)" \
  "projected REST GitHub App metadata"
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
assert_eq "implementation_from_interaction=false reply=false resolve=false" \
  "$(actions_for_path "$(printf '%s' '{"retrieval_complete":true,"comments":[{"surface":"graphql","author":{"__typename":"Bot"}},{"surface":"graphql","author":{"__typename":"User"}}]}' | classify_chain)")" \
  "Bot root with User reply prohibited actions"
assert_eq "HUMAN_STOP" \
  "$(printf '%s' '{"retrieval_complete":true,"comments":[{"surface":"graphql","author":{"__typename":"Bot"}},{"surface":"graphql","author":null}]}' | classify_chain)" \
  "Bot root with unknown reply"
assert_eq "implementation_from_interaction=false reply=false resolve=false" \
  "$(actions_for_path "$(printf '%s' '{"retrieval_complete":true,"comments":[{"surface":"graphql","author":{"__typename":"Bot"}},{"surface":"graphql","author":null}]}' | classify_chain)")" \
  "Bot root with unknown reply prohibited actions"
assert_eq "HUMAN_STOP" \
  "$(printf '%s' '{"retrieval_complete":false,"comments":[{"surface":"graphql","author":{"__typename":"Bot"}}]}' | classify_chain)" \
  "incomplete all-Bot thread"

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
  'human-interaction: projected REST App payload uses normal flow' \
  'human-interaction: authoritative GraphQL Bot uses normal flow' \
  'human-interaction: GraphQL uses nested thread and comment cursors' \
  'human-interaction: incomplete GraphQL pagination fails closed' \
  'human-interaction: Bot root with User reply taints thread' \
  'human-interaction: Bot root with unknown reply taints thread' \
  'human-interaction: Bot root with User reply keeps response user-only' \
  'human-interaction: Bot root with unknown reply keeps response user-only' \
  'human-interaction: tainted thread reply and resolution stay user-only' \
  'human-interaction: separate implementation permission keeps reply and resolution user-only' \
  'human-interaction: no drafted posted reply or resolution' \
  'human-interaction: acting-on-behalf enforces posting backstop' \
  'attestation: explicit override requires the interactive verifier' \
  'attestation: eligible request loads the canonical reference' \
  'attestation: unavailable reference fails closed' \
  'attestation: chat text is not interactive verification' \
  'attestation: exact direct reply permits only named action' \
  'attestation: mismatch requires exact retry' \
  'attestation: rejects nonliteral input' \
  'attestation: rejects untrusted provenance' \
  'attestation: rejects stale or changed authorization' \
  'attestation: retrieval and metadata failures remain blocked' \
  'attestation: independent gates still apply'; do
  require "$tests" "Promptfoo regression: $description" "$description"
done

# Literal input/binding use the real checker. Caller-policy scenarios live in
# Promptfoo, not a fixture-only authorization/equality oracle.
python3 "$root/packages/agent-defaults/tests/test_attestation_verifier.py"
node "$root/packages/agent-defaults/tests/test_attestation_prompt.cjs"

if [[ $errors -gt 0 ]]; then
  echo ""
  echo "FAILED: $errors human-interaction contract error(s) found."
  exit 1
fi

echo "OK: human-interaction defaults fail closed; attestation is exact and single-action."
