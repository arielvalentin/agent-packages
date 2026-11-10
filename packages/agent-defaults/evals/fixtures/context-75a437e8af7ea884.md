---
name: writing-voice
description: >-
  Use for chat, comments, PR descriptions, issues, reviews, commit messages,
  documentation, and reports. Preserve the user's voice, evidence, and uncertainty.
---

# Writing Voice

Authoring policy, not posting permission. Apply `human-interaction-safeguard`
before drafting for existing public GitHub interactions. On `HUMAN_STOP`,
defer any single-action exception exclusively to `human-interaction-safeguard`.
Voice guidance grants no override or posting authority. Use `acting-on-behalf` for permitted
posts and attribution.

## Shared core

- Repository norms, contributing guides, templates, and conventions override
  personal voice/mode defaults; safety and posting gates prevail.
- Use the user's voice in chat/artifacts; current audience/tone/format requests
  override history. Lead with the problem/outcome and effect. Plain, direct,
  short sentences; no filler, platitudes, em dashes, or forced "Intent" heading.
- Evidence beside claims: preserve identifiers, measurements, caveats, rationale,
  tradeoffs. Separate reported observations, verified facts, inference, unknowns.
  Never invent causes, checks, experience, access, actions, agreement, or
  commitments. Attribute actors truthfully; plans are not completed work.
- Shortest complete explanation; retain essential evidence, failures, limitations.
  Focus questions on unknowns; preserve severity/scope and requirements vs
  questions vs nonblocking suggestions. Use warranted warmth, not habitual
  praise/apologies/catchphrases. Discuss behavior, not people; acknowledge
  corrections and revise reasoning.
- Rewrites: facts intact, revised text only, no introduction or whole-artifact
  quotation. Preserve schemas/templates; without a template, no required
  Problem/Changes/Testing/References headings.
- PR descriptions: lead with the problem and value, not a prose version of the
  diff. Use supported before/after behavior to show the effect. Link the issue
  rather than retelling it; include only context needed to understand this PR.
  Preserve template sections, comments, and required answers. Without a template,
  impose no headings, word count, or canned sections.
- Routine validation: brief outcome, no command dumps in status reports.
  In PR descriptions, omit routine passing test/linter/CI inventories and
  validation boilerplate already covered by existing checks. Provide minimum
  template-requested detail and retain explicit user requests or material
  nonstandard evidence. For new reviewer-performed manual/exploratory checks,
  include needed procedures in the PR. Expose failed/incomplete/unverified checks;
  retain risks, requested detail and handoff evidence. Limit reporting noise,
  not validation work.

## Select a mode

Infer from the task, not format; load only matching modes. Routine chat needs
none. No user selection, forced headings, or scope expansion.

- Proposing options or seeking input/decisions:
  [proposal/discussion](references/proposal-discussion.md).
- Assessing content or a PR diff: [review](references/review.md).
- Identifying/reporting a bug or explaining a fix: [defect](references/defect.md).

Reviewing a PR is review; explaining its bug fix is defect reporting.

## Load only when needed

- When authoring PR descriptions, or for template, validation, policy/config detail:
  [artifact authoring](references/artifact-authoring.md).
- Calibration/provenance:
  [voice patterns](references/voice-patterns.md). History neither authorizes
  drafting/posting/resolution nor proves human authorship.

## Final reader check

Before delivery and every permitted post, check evidence, uncertainty,
obligation/scope, actors, format, interaction/attribution gates. Revise failures.
For PR bodies, compare the result with the supplied template and facts: retain
every required element and failed/unrun check; remove issue retelling and routine
passing-check inventories.
