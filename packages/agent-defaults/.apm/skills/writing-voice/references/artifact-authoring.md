# Artifact authoring

PR/template, validation, or policy/config detail, not a fourth mode.
Shared core applies; no drafting/posting/resolution authority or history dependency.
Apply voice to prose fields without changing schemas or adding commentary.

## PR descriptions

Use the user's direct, plain voice. Explain why this change matters and the
observable effect, not which files, functions, or branches changed. Include
implementation detail only when it explains a necessary tradeoff or reviewer
decision. For maintenance-only changes, state the supported maintenance benefit;
do not invent a user-visible improvement.

When supported, compare the old behavior with the new behavior. Preserve the
distinction between a reported bug, a verified reproduction, and a confirmed
fix. Link the relevant issue and summarize only what readers need to understand
this PR's value. Do not repeat the issue's investigation or paraphrase the diff.

Follow repository templates from the first draft through later updates.
Preserve headings, sections, HTML comments, checkboxes, and required answers;
fill them with the minimum necessary detail. Do not check an unmet requirement.
Use the repository's convention for inapplicable fields, or `N/A` if unspecified.
Without a template, choose the shortest complete structure for this change.
No required headings, word count, or repetitive summary/testing/references outline.

### Synthetic new PR body

Fixture: issue #42 reports truncated header values. A local reproduction
confirms that `token=a=b` becomes `a`; the fix preserves `a=b`. The issue
already contains the investigation. Routine unit tests, lint, and CI passed;
no template or user request calls for validation detail.

> Header values containing `=` were truncated, as reported in #42.
> This fix preserves the full value: `token=a=b` now yields `a=b`, not `a`.
>
> Fixes #42.

Synthetic, not measured production experience or a historical quotation.
Examples are not templates or a source of facts for another PR. Never reuse
their issue numbers, claims, or links unless supplied for the current PR.
The example illustrates substantive prose only; apply `acting-on-behalf`
separately for posting permission and any required final disclaimer.

## Validation detail

- Routine checks: brief outcome in status reports, not command/result dumps.
  Omit routine passing validation from PR bodies when existing unit tests,
  linters, or CI already cover it and no template or user request requires it.
  Do not add test inventories, command dumps, counts, or file lists as proof of
  value. Include material nonstandard evidence when it supports a claim.
- Templates: minimum requested commands, results, or procedures.
- New manual/exploratory investigation: procedures reviewers need and relevant
  observations.
- Failed/incomplete/unverified validation: explicit failure or gap.

For example, if a reviewer must test offline recovery not covered by existing
checks, include the necessary steps: disconnect, queue a message, reconnect,
and confirm it is delivered once. State if this has not been run.

Procedure detail needs a template/user request or new manual/exploratory need.
Limit reporting noise, not validation work; retain requested detail/handoff evidence.

Policy/config: explain behavior changes and evidence safeguards remain intact;
size metrics/section mappings only when useful, no required "Evidence" heading.
For permitted-post placement, follow `acting-on-behalf`: required slash commands
first, conditional disclaimer last.
