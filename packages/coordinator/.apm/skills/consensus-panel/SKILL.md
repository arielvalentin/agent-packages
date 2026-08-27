---
name: consensus-panel
description: >
  Dispatch a specialist review to two GPT-first reviewers in parallel, then add a
  high-capability tiebreaker only on disagreement or high-risk findings, and
  synthesize a consensus verdict (simple/correct/pragmatic/beneficial). Use for
  every specialist review dispatch; never duplicate identical fact-finding
  research across models to manufacture consensus.
---

# Consensus Panel

**Single reviewer for trivial scopes, adaptive 2+1 for substantive code.**
Non-code-only and genuinely tiny changes get exactly one mid- or
high-capability reviewer. Substantive code changes get two reviewers, plus a
third only when it can change the answer.

## When to use

Use before any specialist review dispatch, **except** scopes that qualify for
the single-reviewer fast path below. Skipping this is a bug unless the role is
explicitly designated single-model or the scope is fast-path exempt.

Do not use this skill for research fact-finding. Research uses one agent per
source; identical queries must never be duplicated across models to manufacture
consensus.

## Step 1 — Classify the scope (always first)

Classify the review scope **before** selecting any model. Re-classify at the
start of every review cycle; a fix that grows the scope also changes its class.

A scope is **fast-path exempt** when either of these holds:

1. **Non-code change** — every changed file is a text artifact with no
   executable effect: documentation, prose, markdown, comments, changelog,
   license, or similar. No source, config, schema, script, or workflow file is
   changed.
2. **Tiny change** — at most **10 changed lines** (added + removed, ignoring
   pure-whitespace lines) across at most **2 files**, including one-line
   changes, with no new or materially altered control flow, no new dependency,
   and no change to a public API contract.

Operational definitions, so two agents classify the same diff identically:

- **Pure-whitespace line** — a changed line whose before and after differ only
  in whitespace. It does not count toward the 10-line budget.
- **New or materially altered control flow** — adding or removing a branch,
  loop, guard, early return, or exception path, **or** changing the condition
  of an existing one. Rewording a comment above a branch is not.
- **Public API contract** — any signature, route, event payload, schema,
  environment variable, CLI flag, or exported symbol that something outside the
  changed files can depend on.
- **New dependency** — referencing a package that is not already declared in a
  dependency manifest (`package.json`, `go.mod`, `Gemfile`, `requirements.txt`,
  and the like). Importing another symbol from a package the repository already
  declares is not a new dependency; adding the manifest entry is.

A fast-path scope is **disqualified** — and takes the full panel — when it
touches any of the following, however small the diff:

1. Authentication, authorization, or access control.
2. Cryptography or secrets.
3. Input validation or untrusted-input parsing.
4. A public API contract.
5. Concurrency, locking, or shared mutable state.
6. Data migration, deletion, or any other irreversible data operation.

This list is closed: a scope that touches none of these and meets the size
threshold is fast-path exempt.

Everything else is a **substantive code change** and takes the adaptive 2+1
panel.

## Step 2a — Single-reviewer fast path (fast-path exempt scopes)

Dispatch **exactly one** reviewer. Do not run a panel, do not select a second
model, and do not synthesize across models.

- **Model tier** — a mid-tier model by default (documentation, prose, and
  mechanical tiny edits); a high-capability model when the tiny change is
  semantically subtle — a boundary or off-by-one condition, a regex, a format
  string, or an arithmetic/units change. The fast path never uses a fast/light
  model.
- **Envelope** — set `consensus_role: single`. Omit `model_index` and
  `panel_wave`. Like `panel-member`, this value tells a panel-aware specialist
  it is already dispatched, so it reviews directly instead of selecting or
  dispatching reviewers of its own.
- **Output** — the reviewer returns the same JSON verdict schema below, so
  downstream gates are unchanged.
- **Report** — still write the report artifact, recording
  `panel: single-reviewer fast path` and which exemption applied.

This exemption **takes precedence** over any general "every specialist review
runs a panel" rule in the coordinator or `review-fix-loop`. A single
`blocker`/`major` finding does not promote a fast-path scope to a panel; only
re-classification under Step 1 does. The safety argument is the size and
disqualifier bounds, not the finding: a scope this small that touches none of
the six disqualified categories has a blast radius one reviewer can hold.

## Step 2b — Panel selection for substantive code changes

Determine the currently available models at dispatch time. Use the same
runtime model-discovery capability categorization used by the general dispatch
policy: high-capability, mid-tier, fast-capable, and fast/light. This does not
require boolean capability metadata or invent a new catalog field. When
discovery succeeds, preserve catalog order and apply this procedure:

1. Deduplicate identical model ID strings before filtering; the **first
   occurrence wins**, including its discovered suitability and capability
   category. A candidate is suitable when runtime discovery says it is
   available for this dispatch and does not identify it as incompatible.
2. For classification only, trim and lowercase the ID. A candidate is GPT when
   the normalized model ID starts with `gpt-`. Family metadata may corroborate
   that classification but must not override the normalized ID rule. An ID that
   does not start with `gpt-` is non-GPT even when family metadata says `gpt`.
3. Reserve Wave 2 before selecting Wave 1: reserve the first suitable unused
   high-capability GPT model ID in catalog order. If none exists, reserve the
   first suitable high-capability non-GPT. If no suitable high-capability model
   exists in any family, mark Wave 2 unavailable. Keep a reservation only when
   at least two other distinct suitable, non-fast/light candidates remain for
   Wave 1; otherwise release it and mark Wave 2 unavailable. Do not dispatch a
   reservation unless an escalation trigger fires.
4. Wave 1 excludes fast/light models. It prefers the capability floor from the
   prior contract: mid-tier or fast-capable models. Treat those as one preferred
   Wave 1 capability class; catalog order is only the deterministic tie-breaker
   within a capability class.
5. Wave 1 prefers two distinct Wave 1-eligible GPT model IDs, excluding the
   Wave 2 reservation. A suitable GPT ID is Wave 1-eligible only when it also
   meets the Wave 1 quality floor, so fast/light GPTs do not count toward GPT
   sufficiency.
   Fill its slots from these ordered classes: mid-tier or fast-capable GPTs,
   then unreserved high-capability GPTs, then mid-tier or fast-capable non-GPTs,
   then unreserved high-capability non-GPTs. Preserve catalog order inside each
   class. Use unreserved high-capability GPTs only after preferred GPT candidates
   are exhausted, retaining one high-capability GPT for Wave 2 when possible. A
   non-GPT may fill a slot only when there are insufficient suitable,
   Wave 1-eligible GPT IDs after the reservation.
6. Wave 1 must exclude the Wave 2 reservation, and no model ID may appear more
   than once across the panel.
7. A successful catalog with fewer than two distinct suitable,
   non-fast/light IDs available to Wave 1 is a selection failure: mark Wave 1
   unavailable and do not start an invalid panel or replace it with runtime
   auto-selection.

The user-requested GPT-first consistency and determinism intentionally override
prior cross-family diversity. This trades model-family diversity for repeatable
selection; the report must make that reduction explicit.

When discovery is unavailable, dispatch without model overrides (runtime
auto-selection) and record that fallback in the report. This fallback still
uses two parallel Wave 1 calls and adds one runtime-auto Wave 2 call only when
an escalation trigger fires.

## Dispatch (substantive code changes only)

### Wave 1 — exactly 2 when selection is available, in parallel

When Wave 1 is available, fire exactly 2 parallel `task` calls to the **same
specialist agent**, each with a different selected `model` override. Never
dispatch a third reviewer in this wave. Set `consensus_role: panel-member`,
`model_index: 1` and `2`, and `panel_wave: initial` in every handoff envelope so
panel-aware specialists do not recursively dispatch their own reviewers.
Include the JSON verdict schema below in every panelist prompt so the panelist
can return structured output even if it doesn't load this skill.

### Wave 2 — exactly 1, only on escalation

Evaluate the escalation triggers below against the wave-1 responses.

- **No trigger fires** → synthesize immediately from the two agreeing
  responses. Do not dispatch a third reviewer.
- **Any trigger fires** → fire exactly **one** additional `task` call to the
  same specialist with the reserved high-capability model, `model_index: 3`,
  and `panel_wave: tiebreak`. If Wave 2 is unavailable, do not reuse a Wave 1
  model; apply the reduced-confidence failure rule below.

The tiebreaker receives the same scope and context as wave 1 and must **not**
receive the wave-1 verdicts or findings — its value depends on reviewing
independently. Never dispatch a fourth reviewer for a single panel.

## Escalation triggers

Escalation triggers apply only to substantive code changes. A fast-path scope
never escalates to a panel — it is complete after its single reviewer.

Dispatch the tiebreaker when **any** of these hold:

1. **Verdict disagreement** — the two responses differ on any verdict axis
   (`simple`, `correct`, `pragmatic`, `beneficial`), including `mixed` against
   `yes` or `no`.
2. **Material finding conflict** — the responses contradict each other about the
   same `location`: opposing fixes, or one asserting broken where the other
   asserts correct.
3. **High-risk finding** — either response reports a finding with severity
   `blocker` or `major`.
4. **Insufficient responses** — fewer than 2 valid responses remain after the
   retry policy in § Failure modes.
5. **Low confidence** — the synthesized confidence is `low`. Confidence merges
   deterministically as the **lower** of the two reported values, ordered
   `high` > `medium` > `low`, so a `high`+`medium` pair synthesizes to `medium`
   and does not escalate, while any `low` escalates.

If none of these hold, the two responses agree and carry no high-risk finding.
Synthesize immediately; a third reviewer cannot change the outcome.

## Verdict schema (every reviewer returns this)

```json
{
  "verdict": {
    "simple":     "yes|no|mixed",
    "correct":    "yes|no|mixed",
    "pragmatic":  "yes|no|mixed",
    "beneficial": "yes|no|mixed"
  },
  "confidence": "high|medium|low",
  "findings": [
    {"severity": "...", "location": "...", "issue": "...", "fix": "..."}
  ],
  "notes": "..."
}
```

## Synthesis rules

A response is **valid** when it parses as JSON and every required field is
present with a value from its enum. Anything else — prose, malformed JSON, a
missing or out-of-enum `confidence` or verdict axis — is invalid after the one
retry in § Failure modes, and does not count toward trigger 4.

Findings are covered by that rule: every entry in `findings` must carry
`severity`, `location`, `issue` and `fix`, and `severity` must be one of
`blocker`, `major`, `minor`, `nit`. A response with any malformed finding entry
is invalid, so it neither counts toward trigger 4 nor suppresses trigger 3 —
escalation never depends on a severity the panelist failed to state.

1. Merge `findings`; dedupe by `(location, issue)`. A finding reported by more
   than one panelist is corroborated and keeps the highest severity reported.
2. Per verdict axis:
   - **Fast path (1 response)** — the single reviewer's value is the verdict.
     There is nothing to merge or vote on.
   - **Not escalated (2 responses)** — both responses agree on every axis by
     definition of trigger 1, so the agreed value is the consensus value.
   - **Escalated (3 responses)** — majority wins; `mixed` when no majority.
   - **Escalated with only 2 valid responses** — when the two agree on an axis
     that value stands; when they differ (including the trigger-1 disagreement
     that caused the escalation) the axis is `mixed`. Flag reduced confidence.
   - **Escalated with fewer than 2 valid responses** — use the valid responses
     that returned, `mixed` when no majority, and flag reduced confidence.
3. Confidence, in every case: the majority value when one exists, otherwise the
   **lowest** value among the valid responses (`high` > `medium` > `low`). This
   is total — it covers the fast path's single value, the non-escalated pair
   (trigger 5), a three-way `high`/`medium`/`low` split, and any partial set
   after failures.
4. Surface a disagreement matrix whenever the panel diverges.
5. Write the report to `${ARTIFACTS_DIR}/04-review-consensus.md`
   (see `handoff-envelope` skill for path resolution).

## Report contents

- Aggregate verdict block.
- Review mode line: `panel: single-reviewer fast path` (with the exemption that
  applied) or `panel: adaptive 2+1`.
- Selected model IDs used, labelled by wave (`initial` / `tiebreak`), or the
  single reviewer's model and chosen tier on the fast path.
- For an adaptive panel, the report must list the selected model IDs. Because
  user-requested GPT-first consistency and determinism intentionally override
  prior cross-family diversity, state `intentionally reduced model-family
  diversity` whenever selection uses one family rather than treating it as an
  accidental fallback.
- Escalation line: `escalated: yes|no`, and when yes, which trigger(s) fired.
  Always `no` on the fast path.
- Disagreement matrix (which model returned what per axis). Omitted on the fast
  path.
- Consolidated findings, sorted by severity, with corroboration noted.
- Confidence line: the synthesized confidence per synthesis rule 3 (majority,
  otherwise the lowest valid value).

## Failure modes

- Reviewer returns prose instead of JSON → retry once with the schema
  re-injected. If it is still prose, record that verdict as `mixed`, count the
  response as invalid for trigger 4, and note it.
- Fast-path reviewer fails to return after the retry → dispatch one replacement
  reviewer at the same or higher tier. Do not silently open a panel.
- Fewer than 2 valid initial responses → escalate under trigger 4, surface which
  model(s) failed, and flag the result as reduced-confidence.
- Fewer than 2 valid responses in total after escalation → proceed with whatever
  returned and flag as reduced-confidence.
- Tiebreaker fails to return → proceed with the 2 initial responses under the
  "escalated with only 2 valid responses" rule above, and flag as
  reduced-confidence.
- Wave 2 is unavailable when escalation fires → do not reuse a Wave 1 model;
  proceed with the initial responses under the "escalated with only 2 valid
  responses" rule, record the selection failure, and flag reduced confidence.
- Wave 1 is unavailable after successful discovery → dispatch no reviewers,
  write the consensus report with the selection failure and any candidate IDs,
  set every verdict axis to `mixed` with `low` confidence, and stop the review
  gate for coordinator or user intervention. Do not present an unreviewed scope
  as a synthesized verdict.

## Backward compatibility

`model_index` keeps its `1|2|3` values: `1` and `2` are the initial wave, `3` is
the conditional tiebreaker. `panel_wave` is additive — an envelope that omits it
is read as `initial` for `model_index` 1–2 and `tiebreak` for 3. The
single-reviewer fast path reuses the existing `consensus_role: single` value and
adds no new envelope field.
