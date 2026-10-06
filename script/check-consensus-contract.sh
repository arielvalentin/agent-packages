#!/usr/bin/env bash
# Validates the coordinator fast path and conditional consensus contract.
#
# The coordinator must handle bounded work directly, prevent nested
# orchestration, and reserve review panels for explicit or high-risk cases.
# When consensus is selected, non-code and genuinely tiny scopes take a single
# mid- or high-capability reviewer, and substantive code changes take a
# GPT-first adaptive 2+1 panel.
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

panel="$root/packages/coordinator/.apm/skills/consensus-panel/SKILL.md"
agent="$root/packages/coordinator/.apm/agents/coordinator.agent.md"
loop="$root/packages/coordinator/.apm/skills/review-fix-loop/SKILL.md"
envelope="$root/packages/coordinator/.apm/skills/handoff-envelope/SKILL.md"
adversarial="$root/packages/coordinator/.apm/skills/adversarial-review/SKILL.md"
tests="$root/packages/coordinator/tests/promptfooconfig.yaml"

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

# --- Direct-work fast path and orchestration bounds ---
require "$agent" "direct inspect-edit-validation-response path" \
  'inspect -> edit -> targeted validation -> final response'
require "$agent" "roughly five-call delegation threshold" \
  'roughly five direct tool calls'
require "$agent" "one orchestration owner invariant" \
  'choose exactly one orchestration owner'
require "$agent" "prohibition on parent and coordinator worker ownership" \
  'never do both for the same objective'
require "$agent" "routine review cap" \
  'at most one review gate'
require "$agent" "routine automatic critique prohibition" \
  'do not run plan critique, assumption critique, adversarial review, consensus'
require "$agent" "conditional artifact creation" \
  'create an artifact only when'
require "$agent" "delegated budget stop condition" \
  'exceeds its time, retry, or context budget'
require "$agent" "explicit security review first" \
  'invoke `security-review` first'
require "$agent" "policy changes requiring adversarial review" \
  'behavior-defining agent, skill, instruction, governance, safeguard, workflow, or contract-check policy.{0,120}run `adversarial-review`'
require "$agent" "direct commit and push boundary" \
  'do not commit, push, or publish unless the user explicitly requested'

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
  'never dispatch a fourth reviewer'
require "$panel" "independent tiebreaker (no wave-1 verdicts)" \
  'must \*\*not\*\* receive the wave-1 verdicts'
require "$agent" "coordinator escalating to exactly one tiebreaker" \
  'escalate to exactly 1 tiebreaker'
require "$agent" "high-capability tiebreaker independent of the initial wave" \
  'high-capability GPT model independent of'
require "$agent" "coordinator non-GPT fallback policy" \
  'non-GPT model only for a slot that (the )?available suitable GPT choices cannot fill'
if normalize "$agent" | grep -Eiq -- \
  'Consensus panel .*initial wave .{1,80} Cross-family diversity'; then
  echo "ERROR: ${agent#"$root/"}: stale mandatory cross-family initial-wave model selection"
  errors=$((errors + 1))
fi

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
require "$panel" "behavior-defining policy disqualifier" \
  'agent, skill, instruction, orchestration, governance, or safeguard policy'
require "$panel" "public-interaction control disqualifier" \
  'human-interaction, attribution, public-posting, permission, approval'
require "$panel" "explicit consensus minimum of two reviewers" \
  'explicit user request for consensus or multiple independent verdicts always uses at least the two-reviewer initial wave'
require "$panel" "panel-required scope definition" \
  'scope is \*\*panel-required\*\*.{0,220}explicitly requested consensus, a panel, or a multi-reviewer adversarial review'
require "$panel" "panel selection applying to every panel-required scope" \
  'panel selection for panel-required scopes'
require "$panel" "panel dispatch applying to every panel-required scope" \
  'dispatch \(panel-required scopes only\)'
require "$panel" "explicit tiny panels using escalation triggers" \
  'escalation triggers apply to every panel-required scope'
require "$panel" "concurrency listed as a disqualifier" \
  'concurrency, locking, or shared mutable state'
require "$panel" "irreversible data operations listed as a disqualifier" \
  'irreversible data operation'
require "$panel" "privacy and data exposure disqualifier" \
  'privacy, personal data, sensitive-data exposure'
require "$panel" "unsafe execution disqualifier" \
  'unsafe code execution, command execution, shell execution'
require "$panel" "trust-boundary disqualifier" \
  'trust-boundary changes, including network access, filesystem access'
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
require "$agent" "coordinator applying the panel to panel-required scopes" \
  'adaptive 2\+1 panel \(panel-required scopes\)'
require "$loop" "fix cycles re-classifying scope for the fast path" \
  'Otherwise, re-classify the updated `scope`'
require "$loop" "explicit consensus bypassing the single-reviewer fast path" \
  'explicit user request for consensus, a panel, or a multi-reviewer adversarial review always dispatches two'
require "$loop" "explicit consensus preserved across fix cycles" \
  'every post-fix re-review as `PANEL_2`'
require "$loop" "explicit re-review using panel-member envelopes" \
  'initial wave of 2\*\* with two `consensus_role: panel-member` envelopes'
require "$loop" "explicit review never using a single envelope" \
  'never.{0,40}consensus_role: single'
require "$agent" "expanded security-sensitive review categories" \
  'privacy or sensitive-data exposure, unsafe code or command execution'
require "$agent" "mandatory safeguards overriding the five-call heuristic" \
  'Mandatory safeguards always override the five-call heuristic'
require "$agent" "five-call prohibition limited to routine ungated work" \
  'Delegate routine ungated work finishable with roughly five direct tool calls'

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
  'a response is \*\*valid\*\* when it parses as json'
require "$panel" "finding entries are covered by the validity rule" \
  'malformed finding entry is invalid'
require "$panel" "total confidence rule" \
  'otherwise the \*\*lowest\*\* value among the valid responses'
require "$agent" "coordinator deferring to canonical scope definitions" \
  'operational definitions'
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
require "$tests" "promptfoo regression for consensus-panel source of truth" \
  'adversarial-review: standalone defers to consensus-panel as the source of truth'
require "$tests" "promptfoo regression requiring consensus-panel JSON instead of markdown prose" \
  'adversarial-review: standalone returns consensus-panel JSON instead of markdown prose'
require "$tests" "promptfoo regression rejecting informational severity" \
  'adversarial-review: standalone does not reintroduce informational severity'
require "$tests" "promptfoo regression requiring the shared consensus report artifact" \
  'adversarial-review: standalone delegates the shared consensus report artifact'
require "$tests" "promptfoo regression requiring consensus-panel failure handling" \
  'adversarial-review: standalone uses consensus-panel failure handling'
require "$tests" "promptfoo regression rejecting GPT-host Opus-plus-Gemini substitution" \
  'consensus-panel: GPT host does not select Opus plus Gemini when GPT reviewers are available'
require "$tests" "promptfoo regression rejecting mandatory cross-family reviewers on GPT hosts" \
  'consensus-panel: GPT host does not require cross-family reviewers'
require "$tests" "promptfoo regression rejecting GPT-host family exclusion" \
  'consensus-panel: GPT host does not exclude GPT reviewers from selection'
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
require "$loop" "re-review starting a fresh initial wave of 2" \
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
