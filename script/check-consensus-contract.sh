#!/usr/bin/env bash
# Validates the consensus review contract.
#
# The agent-defaults package must state a deterministic review policy: non-code and
# genuinely tiny scopes take a single mid- or high-capability reviewer, and
# substantive code changes take a GPT-first adaptive 2+1 panel — an initial wave
# of exactly two reviewers, plus exactly one high-capability tiebreaker dispatched
# only when an escalation trigger fires. Residual "always three high-capability
# panelists" language makes the contract ambiguous.
#
# Patterns are matched against whitespace-normalized file contents so that
# prose wrapped across lines still matches.
#
# Scope: the forbid patterns detect accidental regression toward the old
# always-three policy. They are lexical, so they cannot be semantically
# complete — a determined author can always paraphrase around them. Treat a
# forbid hit as a real failure, but do not read a clean run as proof that no
# always-three rule was introduced; that is what review is for.
set -euo pipefail

errors=0
root="$(git rev-parse --show-toplevel)"

panel="$root/packages/agent-defaults/.apm/skills/consensus-panel/SKILL.md"
loop="$root/packages/agent-defaults/.apm/skills/review-fix-loop/SKILL.md"
envelope="$root/packages/agent-defaults/.apm/skills/handoff-envelope/SKILL.md"
adversarial="$root/packages/agent-defaults/.apm/skills/adversarial-review/SKILL.md"
tests="$root/packages/agent-defaults/evals/agent-defaults.eval.yaml"

normalize() {
  tr '\n' ' ' <"$1" | tr -s '[:space:]' ' '
}

# require <file> <description> <extended-regex>
require() {
  local file="$1" desc="$2" pattern="$3"
  if [[ ! -f "$file" ]]; then
    echo "ERROR: missing file: ${file#"$root/"}"
    errors=$((errors + 1))
    return
  fi
  if [[ "$file" == "$tests" ]]; then
    if ! python3 - "$file" "$pattern" <<'PY'
import sys
import yaml

contracts = {
    "013": ("smoke", "Review complete:"),
    "015": ("smoke", "TWO candidate objects"),
    "016": ("smoke", "invalid finding severity"),
    "018": ("smoke", "omits the findings field"),
    "019": ("smoke", '"findings": null'),
    "020": ("smoke", '"findings": {}'),
    "022": ("smoke", "a fourth reviewer"),
    "054": ("smoke", "already-requested Copilot review is pending"),
    "157": ("smoke", "remains true after the fix"),
    "312": ("full", "single source of truth"),
    "313": ("full", "instead of the consensus-panel JSON verdict schema"),
    "314": ("full", "informational finding severity"),
    "315": ("full", "04-review-consensus.md"),
    "316": ("full", "fallback and failure handling"),
    "320": ("full", "remains unresolved but labels it minor"),
    "321": ("smoke", "Must the loop still run the fix and post-fix review"),
    "323": ("smoke", "that same issue is unresolved but labels it minor"),
    "324": ("smoke", "omits it and provides no resolution evidence"),
    "325": ("full", "May the gate proceed with a warning"),
    "326": ("full", "unresolved major finding at max_retries"),
    "383": ("full", "Opus plus Gemini"),
    "384": ("full", "spans multiple model families"),
    "385": ("full", "exclude GPT reviewer models"),
    "392": ("smoke", "validated explicit_multi_review boolean is true"),
    "393": ("smoke", "added as tiebreakers"),
    "396": ("smoke", "changes agent behavior"),
    "411": ("smoke", "explicitly requests two independent reviewers"),
}
file, name = sys.argv[1:]
suite, anchor = contracts[name.split("-case-")[1].split("-")[0]]
with open(file) as stream:
    data = yaml.safe_load(stream)
matches = [s for s in data.get("stimuli", []) if s.get("name") == name]
sys.exit(not (
    len(matches) == 1
    and matches[0].get("tags", {}).get("suite") == suite
    and anchor in matches[0].get("prompt", "")
    and matches[0].get("graders")
))
PY
    then
      echo "ERROR: ${file#"$root/"}: missing $desc"
      errors=$((errors + 1))
    fi
    return
  fi
  if ! normalize "$file" | grep -Eiq -- "$pattern"; then
    echo "ERROR: ${file#"$root/"}: missing $desc"
    errors=$((errors + 1))
  fi
}

# forbid_in_packages <description> <extended-regex>
forbid_in_packages() {
  local desc="$1" pattern="$2" file hits=""
  while IFS= read -r file; do
    if normalize "$file" | grep -Eiq -- "$pattern"; then
      hits="$hits  ${file#"$root/"}"$'\n'
    fi
  done < <(find "$root/packages" -type f \( -name '*.md' -o -name '*.yml' -o -name '*.yaml' \) -not -name 'CHANGELOG.md' | sort)

  if [[ -n "$hits" ]]; then
    echo "ERROR: stale unconditional-panel language ($desc):"
    printf '%s' "$hits"
    errors=$((errors + 1))
  fi
}

# --- Initial wave is exactly two reviewers ---
require "$panel" "initial wave of exactly 2 parallel dispatches" \
  'exactly 2 parallel .task. calls'
require "$panel" "prohibition on a third reviewer in the initial wave" \
  'never dispatch a third reviewer in this wave'
require "$panel" "mid-tier/fast model preference for the initial wave" \
  'mid-tier or fast-capable'
require "$panel" "two distinct GPT model IDs preferred for the initial wave" \
  'prefer exactly 2 distinct suitable GPT model IDs'
require "$panel" "high-capability GPT model preferred for the tiebreaker" \
  'prefer a distinct high-capability GPT model ID'
require "$panel" "non-GPT models used only as fallback" \
  'non-GPT models only to fill slots when the available suitable GPT choices cannot fill them'
require "$panel" "GPT-first explicitly overrides cross-family diversity" \
  'GPT-first intentionally overrides cross-family diversity'
require "$panel" "all slots use GPT when enough choices exist" \
  'when enough suitable GPT choices exist, all three model slots are GPT'
require "$panel" "non-GPT diversity substitution is prohibited" \
  'do not introduce a non-GPT model for diversity'

# --- Third reviewer is conditional, independent, and capped at one ---
require "$panel" "conditional single tiebreaker wave" \
  'wave 2 .{1,4} exactly 1, only on escalation'
require "$panel" "hard cap of three reviewers per panel" \
  'never dispatch a fourth reviewer'
require "$panel" "independent tiebreaker (no wave-1 verdicts)" \
  'must \*\*not\*\* receive the wave-1 verdicts'

# --- All five escalation triggers are documented ---
for trigger in \
  'verdict disagreement' \
  'material finding conflict' \
  'high-risk finding' \
  'insufficient responses' \
  'low confidence'; do
  require "$panel" "escalation trigger: $trigger" "\*\*$trigger\*\*"
done
require "$panel" "blocker/major severity as a high-risk trigger" \
  'severity .blocker. or .major.'

# --- No third reviewer when the two agree ---
require "$panel" "immediate synthesis when the initial wave agrees" \
  'synthesize immediately'
require "$panel" "explicit no-op rationale for the skipped tiebreaker" \
  'a third reviewer cannot change the outcome'

# --- Synthesis rules cover both the escalated and non-escalated paths ---
require "$panel" "majority-per-axis synthesis for the escalated path" \
  'majority wins'
require "$panel" "unanimous two-response synthesis for the non-escalated path" \
  'not escalated \(2 responses\)'
require "$panel" "finding dedupe by (location, issue)" \
  'dedupe by .\(location, issue\)'
require "$panel" "disagreement matrix reporting" \
  'disagreement matrix'
require "$panel" "reduced-confidence failure handling" \
  'reduced-confidence'
require "$panel" "evidence of which trigger fired in the report" \
  'escalated: yes\|no'

# --- Single-reviewer fast path for non-code and tiny scopes ---
require "$panel" "scope classification running before model selection" \
  'classify the review scope'
require "$panel" "single-reviewer fast path section" \
  'single-reviewer fast path'
require "$panel" "exactly one reviewer on the fast path" \
  'exactly one\*\* reviewer'
require "$panel" "prohibition on a panel for fast-path scopes" \
  'do not run a panel'
require "$panel" "non-code exemption" \
  '\*\*non-behavioral editorial change\*\*'
require "$panel" "tiny-change exemption with a deterministic line threshold" \
  '\*\*10 changed lines\*\*'
require "$panel" "deterministic file threshold for tiny changes" \
  'at most \*\*2 files\*\*'
require "$panel" "one-line changes covered by the tiny exemption" \
  'including one-line changes'
require "$panel" "mid- or high-capability tier on the fast path" \
  'mid-tier model'
require "$panel" "prohibition on fast/light models for reviews" \
  'never a fast/light model'
require "$panel" "consensus_role: single on the fast path" \
  'consensus_role: single'
require "$panel" "fast-path exemption overriding the general panel rule" \
  'takes precedence'
require "$panel" "security-sensitive disqualifiers forcing a panel" \
  'takes the full panel'
require "$panel" "closed disqualifier list" \
  'this list is closed'
require "$panel" "concurrency listed as a disqualifier" \
  'concurrency, locking, or shared mutable state'
require "$panel" "irreversible data operations listed as a disqualifier" \
  'irreversible data operation'
require "$panel" "behavior-defining policy changes disqualify the tiny fast path" \
  'behavior-defining instruction, policy, prompt, or contract that changes agent behavior, gates, or decisions'
require "$panel" "operational definition of a pure-whitespace line" \
  '\*\*pure-whitespace line\*\*'
require "$panel" "operational definition of altered control flow" \
  '\*\*new or materially altered control flow\*\*'
require "$panel" "operational definition of a public API contract" \
  '\*\*public API contract\*\*'
require "$panel" "deterministic confidence merge for the initial wave" \
  'lower\*\* of the two'
require "$panel" "single-reviewer fast path completing without a tiebreaker" \
  'single-reviewer fast path is complete after its one reviewer and has no tiebreaker'
require "$panel" "explicit multi-review selecting the panel before scope exemption" \
  '.true. requires the adaptive 2\+1 panel for every scope'
require "$panel" "explicit multi-review overriding a single-model designation" \
  '.true. value overrides any single-model designation and always selects the adaptive 2\+1 panel'
require "$panel" "explicit multi-review retaining panel escalation triggers" \
  'including a fast-path-exempt scope selected for a panel by .explicit_multi_review: true.'
require "$panel" "major findings triggering a tiebreaker in any panel mode" \
  'a .blocker. or .major. finding always triggers one tiebreaker in panel mode, regardless of file type or size'
require "$loop" "fix cycles re-classifying scope for the fast path" \
  're-classify the scope at the start of every cycle'
require "$loop" "explicit multi-review preserving the panel on every fix cycle" \
  'Re-run .reviewer. through the same dispatch policy against the updated .scope., preserving .explicit_multi_review. unchanged in every handoff'
require "$loop" "false-valued designated single-model exemption survives a missing panel skill" \
  'An explicitly designated single-model role with .explicit_multi_review: false. may bypass .consensus-panel., even if that skill is unavailable'
require "$loop" "other review paths retain the mandatory consensus contract" \
  'Otherwise, before every review dispatch, load .consensus-panel. for classification, review-mode selection, dispatch, JSON verdict schema, parsing, synthesis, and failure handling; if unavailable, stop the gate'
require "$loop" "single-model exemption does not weaken safety disqualifiers" \
  'This exemption does not waive any other safety gate or change scope disqualifiers'
require "$loop" "caller-supplied findings require evidence-backed resolution statuses" \
  'resolved., .unresolved., or .not applicable. in its report notes, with evidence'
require "$loop" "accepted findings use a validated consensus finding record" \
  'recognized .severity. \(.blocker., .major., .minor., or .nit.\) and non-empty .location., .issue., and .fix. strings'
require "$loop" "accepted findings below threshold cannot pass while unresolved" \
  'a below-threshold label or omission from the latest findings list does not resolve a required finding'
require "$loop" "accepted findings enter fix cycle regardless of severity" \
  'non-empty caller-supplied .accepted_findings. set always proceeds to the fix cycle, regardless of severity'
require "$loop" "intake threshold findings retain required status after fixes" \
  'every caller-supplied finding and every intake finding at or above .severity_threshold.'
require "$loop" "omitted or downgraded intake findings remain unresolved" \
  'even if the reviewer omits it from the new findings list or lowers its severity'
require "$loop" "warn cannot waive unresolved intake threshold findings" \
  'intake finding at or above .severity_threshold. remains unresolved, stop and escalate regardless of .on_exhaust.'
require "$tests" "regression for unresolved accepted findings below threshold" \
  'agent-defaults-case-320-row-01'
require "$tests" "regression for accepted minor findings" \
  'agent-defaults-case-321-row-01'
require "$tests" "regression for intake finding severity downgrade" \
  'agent-defaults-case-323-row-01'
require "$tests" "regression for omitted intake finding" \
  'agent-defaults-case-324-row-01'
require "$tests" "regression for explicit multi-review persisting to post-fix panel" \
  'agent-defaults-case-157-row-01'
require "$tests" "regression for explicit true initial panel size" \
  'agent-defaults-case-392-row-01'
require "$tests" "regression for user-requested multi-review intent" \
  'agent-defaults-case-411-row-01'
require "$tests" "regression for tiny behavior-defining Markdown changes" \
  'agent-defaults-case-396-row-01'
require "$tests" "regression for warn exhaustion with intake blockers" \
  'agent-defaults-case-326-row-01'
if [[ "$(grep -Ec '^[[:space:]]*explicit_multi_review: false$' "$loop" || true)" -ne 1 ]]; then
  echo "ERROR: $loop: the usage example must include an explicit_multi_review boolean"
  errors=$((errors + 1))
fi
require "$panel" "behavior-defining edits override the tiny-change limit" \
  'changes one line, only changes Markdown, or meets the tiny-change limit'

# --- Dispatched reviewers never fan out (anti-recursion guard) ---
require "$adversarial" "recursion guard covering panel members and fast-path singles" \
  'panel-member.{0,14}single'
require "$envelope" "envelope stating only primary may fan out" \
  'only .primary. may fan out'
require "$panel" "fast-path envelope carrying the anti-recursion semantics" \
  'it is already dispatched'

require "$panel" "operational definition of a new dependency" \
  '\*\*new dependency\*\*'
require "$panel" "definition of a valid response" \
  'a response is \*\*valid\*\* when the extracted object parses as json'
require "$panel" "raw, fenced, and embedded payload support" \
  'Accept raw JSON, exactly one fenced JSON block.{0,100}exactly one embedded top-level JSON object'
require "$panel" "unique candidate across entire response" \
  'exactly one candidate object across the response, whether fenced or unfenced'
require "$panel" "ambiguous candidates fail closed" \
  'Zero or multiple candidate objects is invalid'
require "$panel" "nested objects are not separate candidates" \
  'Count maximal object candidates, not nested objects'
require "$panel" "string-aware brace matching" \
  'respect JSON strings and escapes'
require "$panel" "no malformed-payload repair" \
  'do not repair malformed JSON'
require "$panel" "one retry preserves extraction" \
  'retry once with the schema and extraction rule re-injected'
require "$panel" "wrappers do not cause retry or escalation" \
  'Wrapping alone is not a reason to retry or escalate'
for case_name in \
  'agent-defaults-case-013-row-01' \
  'agent-defaults-case-015-row-01' \
  'agent-defaults-case-016-row-01' \
  'agent-defaults-case-022-row-01'; do
  require "$tests" "regression $case_name" "$case_name"
done
require "$panel" "finding entries are covered by the validity rule" \
  'malformed finding entry is invalid'
require "$panel" "findings must be a top-level array" \
  'findings. must be an array, including an empty array'
require "$panel" "missing, null, and non-array findings are invalid" \
  'missing, .null., or non-array .findings. value makes the payload invalid'
require "$tests" "regression for a missing findings field" \
  'agent-defaults-case-018-row-01'
require "$tests" "regression for a null findings field" \
  'agent-defaults-case-019-row-01'
require "$tests" "regression for a non-array findings field" \
  'agent-defaults-case-020-row-01'
require "$tests" "regression for warn exhaustion with accepted findings" \
  'agent-defaults-case-325-row-01'
require "$tests" "regression for explicit multi-review retaining panel escalation" \
  'agent-defaults-case-393-row-01'
require "$tests" "regression for pending Copilot review in the blocked state" \
  'agent-defaults-case-054-row-01'
require "$root/packages/agent-defaults/.apm/skills/pr-lifecycle/references/readiness.md" \
  "blocked state allowing only the bounded Copilot review path" \
  'sole unmet requirement is an already-requested Copilot review that Phase 5 can process'
require "$panel" "total confidence rule" \
  'otherwise the \*\*lowest\*\* value among the valid responses'
require "$adversarial" "standalone adversarial review deferring to consensus-panel as the source of truth" \
  'invoke[[:space:][:punct:]]+consensus-panel[[:space:][:punct:]]+first.{0,120}single source of truth'
require "$adversarial" "standalone adversarial review delegating the canonical review contract" \
  'canonical review contract: scope classification, dispatch, json verdict schema, synthesis, reporting, and failure handling'
require "$adversarial" "standalone adversarial review delegating the shared consensus report artifact" \
  '04-review-consensus\.md'
require "$adversarial" "standalone adversarial review requiring the canonical JSON verdict schema" \
  'exact json verdict schema required by[[:space:][:punct:]]+consensus-panel([[:space:][:punct:]]|$)'
require "$adversarial" "standalone adversarial review rejecting local prose and informational findings" \
  'do not emit prose, markdown headings, a local summary report, or .informational. findings'
require "$adversarial" "standalone adversarial review using consensus-panel fallback and failure rules" \
  'fallback and failure rules'
require "$tests" "native evaluation mapping for consensus-panel source of truth" \
  'agent-defaults-case-312-row-01'
require "$tests" "native evaluation mapping requiring consensus-panel JSON instead of markdown prose" \
  'agent-defaults-case-313-row-01'
require "$tests" "native evaluation mapping rejecting informational severity" \
  'agent-defaults-case-314-row-01'
require "$tests" "native evaluation mapping requiring the shared consensus report artifact" \
  'agent-defaults-case-315-row-01'
require "$tests" "native evaluation mapping requiring consensus-panel failure handling" \
  'agent-defaults-case-316-row-01'
require "$tests" "native evaluation mapping rejecting GPT-host Opus-plus-Gemini substitution" \
  'agent-defaults-case-383-row-01'
require "$tests" "native evaluation mapping rejecting mandatory cross-family reviewers on GPT hosts" \
  'agent-defaults-case-384-row-01'
require "$tests" "native evaluation mapping rejecting GPT-host family exclusion" \
  'agent-defaults-case-385-row-01'
if normalize "$adversarial" | grep -Eiq -- \
  'independent model lineages|different lineages|different families|reduced independence'; then
  echo "ERROR: ${adversarial#"$root/"}: stale standalone lineage-selection wording"
  errors=$((errors + 1))
fi
if normalize "$adversarial" | grep -Eiq -- \
  'severity: blocker \| major \| minor \| informational|adversarial review summary|pass-with-concerns|minor / informational|corroboration matrix|reduced-assurance'; then
  echo "ERROR: ${adversarial#"$root/"}: stale standalone local output contract wording"
  errors=$((errors + 1))
fi
if normalize "$tests" | grep -Eiq -- \
  'independent model lineages|different lineages|different families'; then
  echo "ERROR: ${tests#"$root/"}: stale standalone lineage-selection regression wording"
  errors=$((errors + 1))
fi

# --- Envelope backward compatibility ---
require "$panel" "model_index backward compatibility note" \
  'backward compatibility'
require "$envelope" "model_index retains its 1|2|3 values" \
  '"model_index": "1\|2\|3"'
require "$envelope" "additive panel_wave field" \
  'panel_wave'

# --- Fix cycles restart at the initial wave ---
require "$panel" "re-review starting a fresh initial wave of 2" \
  'fresh initial wave of 2'
require "$loop" "adaptive panel policy reference" \
  'adaptive 2\+1'

# --- Fact-finding stays single-model ---
require "$panel" "fact-finding exclusion" \
  'do not use this skill for research fact-finding'

# --- No residual "always three high-capability panelists" language ---
# Anchored on the nouns, not the verbs: any wording that pairs the number three
# with reviewers/models/panelists is stale, whichever verb introduces it.
forbid_in_packages "fires three panelists unconditionally" \
  '(\*\*)?(3|three)(\*\*)? +(parallel|panel |panelists|reviewers?|models|high-capability)'
forbid_in_packages "selects three panel models unconditionally" \
  '(3|three)(\*\*)? +panel models'
forbid_in_packages "prefers three high-capability panelists" \
  'prefer (3|three) high-capability'
forbid_in_packages "claims every panelist is high-capability" \
  'all (\w+ ){0,2}high-capability'
forbid_in_packages "requires three panel responses" \
  '(fewer than (3|three) responses|(3|three) model responses)'
forbid_in_packages "makes the tiebreaker unconditional" \
  'always (add|adds|adding|dispatch|dispatches|include|includes) a third'
forbid_in_packages "adds a third reviewer without an escalation trigger" \
  '(then|and) (always )?add(s|ing)? a third (reviewer|model|panelist)'
forbid_in_packages "contradicts the adaptive policy with an always-three rule" \
  'always (dispatch|use|run|fire) (3|three)'
forbid_in_packages "reintroduces highest-capability models in the initial wave" \
  '(two|2) highest-capability models'

# The same rule can be reintroduced without naming the number, by describing the
# tiebreaker itself as unconditional. Anchored on the modality, not the count.
forbid_in_packages "describes the tiebreaker as unconditional" \
  '(mandatory|required|unconditional|obligatory|automatic) (tiebreaker|third reviewer)'
forbid_in_packages "asserts the tiebreaker always runs" \
  'tiebreaker is (mandatory|required|unconditional|automatic|always)'
forbid_in_packages "dispatches a further reviewer unconditionally" \
  '(always|unconditionally|invariably|routinely) (dispatch|fire|run|add|include|ask|send)(es|s|ing)? (a |an |the )?(tiebreaker|third|additional reviewer|extra reviewer|further reviewer)'
forbid_in_packages "ignores the escalation triggers" \
  'regardless of (the |any )?(escalation )?(trigger|disagreement)'
forbid_in_packages "escalates even when the initial wave agrees" \
  'even when the (first |initial )?(two|pair) (align|agree)'
forbid_in_packages "restores a fixed three-reviewer panel by another name" \
  '(full|complete|entire) trio'
forbid_in_packages "raises the tier for every reviewer" \
  'highest-capability (tier|model|models) for (each|every|all)'

# --- Summary ---
if [[ $errors -gt 0 ]]; then
  echo ""
  echo "FAILED: $errors consensus-contract error(s) found."
  exit 1
else
  echo "OK: consensus review contract is consistent (fast path + adaptive 2+1)."
  exit 0
fi
