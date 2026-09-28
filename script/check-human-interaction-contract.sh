#!/usr/bin/env bash
# Validates the fail-closed public human-interaction contract.
set -euo pipefail

errors=0
root="$(git rev-parse --show-toplevel)"

policy="$root/packages/coordinator/.apm/skills/human-interaction-safeguard/SKILL.md"
acting="$root/packages/coordinator/.apm/skills/acting-on-behalf/SKILL.md"
resolver="$root/packages/coordinator/.apm/skills/resolve-github-user/SKILL.md"
feedback="$root/packages/coordinator/.apm/skills/pr-feedback-review/SKILL.md"
lifecycle="$root/packages/coordinator/.apm/skills/pr-lifecycle/SKILL.md"
protocol="$root/packages/coordinator/.apm/skills/pr-review-protocol/SKILL.md"
agent="$root/packages/coordinator/.apm/agents/coordinator.agent.md"
readme="$root/packages/coordinator/README.md"
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
require "$policy" "unconditional user-authored response" \
  'Agent-authored replies and agent-performed thread resolution are never permitted'
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

# --- No reply/resolve override and no interaction-initiated-change loophole ---
forbid "$policy" "HUMAN_STOP override" \
  '(may|can|should) override|override (is|remains) (allowed|permitted)|solely'
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
require "$feedback" "feedback chain taint deferral" \
  'any `HUMAN_STOP` item taints the whole chain'
require "$lifecycle" "lifecycle chain taint rule" \
  'Any `HUMAN_STOP` item taints the entire chain'
require "$agent" "coordinator chain taint fallback" \
  'Treat the entire chain as `HUMAN_STOP`'

# --- Exact custom fallback and unchanged disclosure triggers ---
assert_eq '> _AI-assisted._' \
  "$(grep '^> _AI-assisted' "$acting")" \
  "exact direct disclaimer"
assert_eq '[^ai]: AI-assisted.' \
  "$(grep '^\[\^ai\]:' "$acting")" \
  "exact footnote disclaimer"
require "$acting" "literal direct-footer Markdown markers" \
  'Preserve the `>` marker, both underscores, and the period'
require "$acting" "raw Markdown copy boundary" \
  'Copy the raw Markdown inside the fence, without the fence itself'
require "$acting" "personal-credentials or explicit-attribution trigger" \
  'uses_personal_credentials OR explicitly_attributes_user'
require "$acting" "explicit known-service attribution decision" \
  'With known bot, app, or service credentials, check attribution before deciding: no user attribution means \*\*No\*\*; explicit user attribution means \*\*Yes\*\*'
require "$acting" "unknown posting provenance pauses" \
  'Unknown credential/account provenance: \*\*Pause and ask before posting\*\*'
require "$acting" "identity resolution only for substantive attribution" \
  'Invoke `resolve-github-user` only when the substantive post separately needs the user.s identity for explicit attribution'
require "$acting" "no metadata lookups solely for disclaimer" \
  'Do not resolve a username or look up model/provider metadata solely to compose the disclaimer'
require "$resolver" "disclaimer needs no username lookup" \
  'The `acting-on-behalf` disclaimer needs no username lookup'
require "$resolver" "disclaimer-only resolution stops before identity sources" \
  'If that is the only task, skip this skill: do not inspect identity sources, run commands, or ask the user for a handle\. Continue below only when a separate operation needs the user.s handle'
forbid "$acting" "legacy username/model disclaimer rules" \
  'include the runtime username|prefer the public model display name|AI-assisted via'
forbid "$resolver" "disclaimer identity-lookup trigger" \
  'attribution, disclaimers|\(disclaimers,'

# --- Built-in disclosure is verified for the actual posting route ---
require "$acting" "route and client-specific disclosure evidence" \
  'actual posting path in the current client/configuration'
require "$acting" "publishing provenance is independent of branding and footer" \
  'Publishing provenance is the account/token actually used, not the host, CLI process, tool name, or footer'
require "$acting" "posting path identifies the actual mechanism and provider" \
  'The posting path is the actual mechanism/provider, not a host or shell label'
require "$acting" "App-hosted CLI may use the observed mechanism" \
  'A CLI agent inside the Copilot App may use the same App-managed posting mechanism'
require "$acting" "adequate disclosure identifies AI or a known AI assistant" \
  'Adequate text identifies AI assistance/authorship or a known AI assistant'
require "$acting" "transport and automation alone are insufficient" \
  'Generic posting/transport attribution and automation alone are not AI disclosure'
require "$acting" "verified built-in disclosure takes precedence" \
  'Prefer verified built-in AI disclosure from the actual posting path\. Do not add a custom disclaimer when that path supplies sufficient disclosure'
require "$acting" "absent insufficient or unverified disclosure uses conditional fallback" \
  'If built-in AI disclosure is absent, insufficient, or unverified, use the custom fallback when disclosure is required'
require "$acting" "unstated availability is unverified" \
  'Unstated or uncertain availability is unverified'
require "$acting" "evidence cannot transfer between routes" \
  'Evidence for one route does not establish another'
require "$acting" "tool name is not a cross-client guarantee" \
  'A tool name alone is not a guarantee across clients/configurations'
require "$acting" "username or byline is not AI disclosure" \
  'A username or byline alone is not AI disclosure'
require "$acting" "verified App reply example" \
  'https://github.com/arielvalentin/agent-packages/pull/46#discussion_r4124650579'
require "$acting" "observed App-managed reply has a personal publisher" \
  'published under the user.s personal account \(REST `user\.type=User`\)'
require "$acting" "observed reply mechanism supplies the note" \
  '`reply_and_resolve_review_thread` mechanism appended the'
require "$acting" "unknown provenance still pauses with built-in disclosure" \
  'Even with verified built-in AI disclosure, unknown credential/account provenance still requires pausing and asking before posting'
require "$acting" "final placement applies only to custom fallback" \
  'This placement rule applies only to the custom fallback in the supplied body, not to tool-managed text'
require "$acting" "tool-managed footer is not rewritten or duplicated" \
  'Do not move, rewrite, or duplicate a tool-managed footer'
require "$acting" "fixing SHA survives every disclosure path" \
  'with built-in disclosure, a custom fallback, or no disclaimer'
require "$acting" "templates are custom-fallback-only" \
  'Use these templates only when the custom fallback is needed'
for consumer in "$feedback" "$lifecycle" "$protocol" "$agent"; do
  require "$consumer" "actual-route attribution delegation" \
    'actual posting route'
  require "$consumer" "canonical disclosure and route section references" \
    'Disclosure decision.{0,40}Posting-path evidence'
  require "$consumer" "two-sided disclosure reminder" \
    'Do not duplicate verified built-in AI disclosure; include any required custom fallback otherwise\.'
done
require "$feedback" "fixing SHA independent of disclosure path" \
  'Keep `Fixed in <commit-sha>` regardless of disclosure path'
require "$lifecycle" "App reply evidence is not PR-body evidence" \
  'Evidence for an App reply does not establish disclosure for a PR create/update route'
require "$protocol" "App reply evidence is not CLI review evidence" \
  'Evidence for an App reply does not establish disclosure for `gh pr review`'
require "$readme" "documented route-aware built-in preference" \
  'Prefer verified built-in AI disclosure for the actual posting path'
require "$readme" "documented verified App reply evidence" \
  'https://github.com/arielvalentin/agent-packages/pull/46#discussion_r4124650579'

# --- Policy answers are not fallback composition ---
require "$acting" "policy questions retain their requested response form" \
  'For policy-only questions that request no post body, honor the requested answer form \(such as Yes/No/Last\)\. Do not render or append a footer'
require "$acting" "actual template text requests remain composition" \
  'Requests for actual post, footer, or template text are composition requests, even when phrased as questions'
require "$acting" "composition follows completed posting decisions" \
  'After the safety, credential/attribution, and route decisions, include any required custom fallback when composing public content'
require "$acting" "required disclosure needs no separate footer request" \
  'No separate request for a footer is needed'
require "$acting" "body-only output is not a disclosure waiver" \
  'Returning only the body does not waive required disclosure'
require "$acting" "literal format validation rejects extra metadata" \
  'For custom-format checks, compare exact Markdown source, not just meaning\. Extra username, model, or provider text is invalid'
require "$acting" "rendering command is scoped to actual composition" \
  'Only for actual fallback composition after those decisions, copy the direct footer exactly'
require "$resolver" "policy questions do not run resolution" \
  'For policy questions, answer the question as phrased in the requested form without performing resolution'
require "$resolver" "fallback composition is not a substantive handle requirement" \
  'Fallback composition itself never needs the handle; substantive attribution or @-mentions may'
require "$resolver" "substantive output permits resolved cached or user-supplied handles" \
  'When a substantive operation needs the handle, return the resolved, cached, or user-supplied username as a plain string'
require "$readme" "documented policy-answer boundary" \
  'Answer policy-only questions in the requested form without rendering a footer'

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
  'acting-on-behalf: requires disclaimer for personal credentials' \
  'acting-on-behalf: omits disclaimer for unattributed bot posts' \
  'acting-on-behalf: pauses for unknown posting provenance' \
  'acting-on-behalf: requires disclaimer for explicit user attribution' \
  'acting-on-behalf: recognizes non-username user attribution' \
  'acting-on-behalf: uses exact footer without identity or model metadata' \
  'acting-on-behalf: uses exact footnote without attribution metadata' \
  'acting-on-behalf: rejects legacy identity-bearing footer' \
  'acting-on-behalf: skips identity lookup solely for disclaimer' \
  'acting-on-behalf: skips model and provider lookups solely for disclaimer' \
  'acting-on-behalf: resolves identity for substantive explicit attribution' \
  'acting-on-behalf: resolver needs no disclaimer lookup' \
  'acting-on-behalf: verified built-in reply avoids duplicate disclaimer' \
  'acting-on-behalf: verified built-in covers explicit user attribution' \
  'acting-on-behalf: unstated built-in availability uses exact fallback' \
  'acting-on-behalf: uncertain built-in uses exact fallback' \
  'acting-on-behalf: reply evidence does not cover CLI comments' \
  'acting-on-behalf: reply evidence does not cover PR bodies' \
  'acting-on-behalf: same tool in another client needs fallback' \
  'acting-on-behalf: username alone is not AI disclosure' \
  'acting-on-behalf: byline alone is not AI disclosure' \
  'acting-on-behalf: built-in footer is not moved or rewritten' \
  'acting-on-behalf: unknown provenance still pauses with built-in disclosure' \
  'acting-on-behalf: HUMAN_STOP still blocks with built-in disclosure' \
  'acting-on-behalf: built-in reply keeps SHA without custom footer' \
  'acting-on-behalf: unattributed bot reply keeps SHA without disclaimer' \
  'acting-on-behalf: built-in disclosure keeps slash command first' \
  'acting-on-behalf: unattributed bot with uncertain built-in omits fallback' \
  'acting-on-behalf: fallback reply keeps SHA before final footer' \
  'acting-on-behalf: fallback footnote is referenced and final' \
  'acting-on-behalf: pr-lifecycle avoids duplicate built-in disclosure' \
  'acting-on-behalf: pr-lifecycle includes required fallback on unverified route' \
  'acting-on-behalf: pr-feedback-review keeps SHA with built-in disclosure' \
  'acting-on-behalf: pr-review protocol requires review-route evidence' \
  'acting-on-behalf: coordinator fallback avoids duplicate built-in disclosure' \
  'acting-on-behalf: route question returns a decision not a footer' \
  'acting-on-behalf: format question returns a verdict not a replacement' \
  'acting-on-behalf: resolver answers substantive lookup question without resolving' \
  'acting-on-behalf: complete body includes uncued required fallback' \
  'acting-on-behalf: transport note does not disclose AI assistance' \
  'acting-on-behalf: negatively phrased fallback lookup question follows meaning' \
  'acting-on-behalf: resolver returns cached username for substantive content' \
  'acting-on-behalf: resolver returns user-supplied username for substantive content'; do
  require "$tests" "Promptfoo regression: $description" "$description"
done

if [[ $errors -gt 0 ]]; then
  echo ""
  echo "FAILED: $errors human-interaction contract error(s) found."
  exit 1
fi

echo "OK: human-interaction contract is fail-closed and user-only."
