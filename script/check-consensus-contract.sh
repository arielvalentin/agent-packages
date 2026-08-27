#!/usr/bin/env bash
# Validates the consensus review contract.
#
# The coordinator package must state a deterministic review policy: non-code and
# genuinely tiny scopes take a single mid- or high-capability reviewer, and
# substantive code changes take an adaptive 2+1 panel — an initial wave of
# exactly two reviewers, plus exactly one high-capability tiebreaker dispatched
# only when an escalation trigger fires. Residual "always three high-capability
# panelists" language makes the contract ambiguous.
#
# Patterns are matched against whitespace-normalized file contents so that
# prose wrapped across lines still matches.
set -euo pipefail

errors=0
root="$(git rev-parse --show-toplevel)"

panel="$root/packages/coordinator/.apm/skills/consensus-panel/SKILL.md"
agent="$root/packages/coordinator/.apm/agents/coordinator.agent.md"
loop="$root/packages/coordinator/.apm/skills/review-fix-loop/SKILL.md"
envelope="$root/packages/coordinator/.apm/skills/handoff-envelope/SKILL.md"
adversarial="$root/packages/coordinator/.apm/skills/adversarial-review/SKILL.md"

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
require "$agent" "coordinator selecting exactly 2 initial panel models" \
  'exactly \*\*2 panel models'
require "$agent" "coordinator firing 2 parallel panel dispatches" \
  'fire \*\*2 parallel'
require "$agent" "coordinator prohibition on an unconditional third reviewer" \
  'never dispatch a third reviewer unconditionally'

# --- Third reviewer is conditional, independent, and capped at one ---
require "$panel" "conditional single tiebreaker wave" \
  'wave 2 .{1,4} exactly 1, only on escalation'
require "$panel" "hard cap of three reviewers per panel" \
  'never dispatch more than 3 reviewers'
require "$panel" "independent tiebreaker (no wave-1 verdicts)" \
  'must \*\*not\*\* receive the wave-1 verdicts'
require "$agent" "coordinator escalating to exactly one tiebreaker" \
  'escalate to exactly 1 tiebreaker'
require "$agent" "high-capability tiebreaker independent of the initial wave" \
  'high-capability model independent of'

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
require "$agent" "coordinator synthesizing immediately without a third" \
  'without waiting for a third'

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
require "$agent" "coordinator synthesis covering both paths" \
  'majority-per-axis when escalated'

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
  '\*\*non-code change\*\*'
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
require "$panel" "operational definition of a pure-whitespace line" \
  '\*\*pure-whitespace line\*\*'
require "$panel" "operational definition of altered control flow" \
  '\*\*new or materially altered control flow\*\*'
require "$panel" "operational definition of a public API contract" \
  '\*\*public API contract\*\*'
require "$panel" "deterministic confidence merge for the initial wave" \
  'lower\*\* of the two'
require "$panel" "fast-path scopes never escalating to a panel" \
  'never escalates to a panel'
require "$agent" "coordinator single-reviewer fast path section" \
  'single-reviewer fast path \(checked first, overrides the panel rule\)'
require "$agent" "coordinator dispatching exactly one fast-path reviewer" \
  'exactly one\*\* mid- or high-capability reviewer'
require "$agent" "coordinator restricting the panel to substantive code changes" \
  'adaptive 2\+1 panel \(substantive code changes\)'
require "$loop" "fix cycles re-classifying scope for the fast path" \
  're-classify the scope each cycle'

# --- Dispatched reviewers never fan out (anti-recursion guard) ---
require "$adversarial" "recursion guard covering panel members and fast-path singles" \
  'panel-member.{0,14}single'
require "$envelope" "envelope stating only primary may fan out" \
  'only .primary. may fan out'
require "$panel" "fast-path envelope carrying the anti-recursion semantics" \
  'it is already dispatched'

# --- Envelope backward compatibility ---
require "$panel" "model_index backward compatibility note" \
  'backward compatibility'
require "$envelope" "model_index retains its 1|2|3 values" \
  '"model_index": "1\|2\|3"'
require "$envelope" "additive panel_wave field" \
  'panel_wave'

# --- Fix cycles restart at the initial wave ---
require "$loop" "re-review starting a fresh initial wave of 2" \
  'fresh initial wave of 2'
require "$loop" "adaptive panel policy reference" \
  'adaptive 2\+1'

# --- Fact-finding stays single-model ---
require "$panel" "fact-finding exclusion" \
  'do not use this skill for research fact-finding'

# --- No residual "always three high-capability panelists" language ---
forbid_in_packages "fires three panelists unconditionally" \
  '(fire|dispatch|run|select|use) (\*\*)?(3|three)(\*\*)? +(parallel|panel |models|reviewers|panelists)'
forbid_in_packages "selects three panel models unconditionally" \
  '(3|three)(\*\*)? +panel models'
forbid_in_packages "prefers three high-capability panelists" \
  'prefer (3|three) high-capability'
forbid_in_packages "claims every panelist is high-capability" \
  'all (\w+ ){0,2}high-capability'
forbid_in_packages "requires three panel responses" \
  '(fewer than (3|three) responses|(3|three) model responses)'
forbid_in_packages "contradicts the adaptive policy with an always-three rule" \
  'always (dispatch|use|run|fire) (3|three)'
forbid_in_packages "reintroduces highest-capability models in the initial wave" \
  '(two|2) highest-capability models'

# --- Summary ---
if [[ $errors -gt 0 ]]; then
  echo ""
  echo "FAILED: $errors consensus-contract error(s) found."
  exit 1
else
  echo "OK: consensus review contract is consistent (fast path + adaptive 2+1)."
  exit 0
fi
