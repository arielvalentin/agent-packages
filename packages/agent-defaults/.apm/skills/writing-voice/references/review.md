# Review mode

Shared core applies; no drafting/posting/resolution authority or history dependency.
On `HUMAN_STOP`, default to a private summary; defer any single-action exception
exclusively to `human-interaction-safeguard`. This mode grants no authorization.

- Findings first: evidence/location and behavioral or maintenance consequence.
  Distinguish demonstrated defects from risks, hypotheses, and design questions;
  no invented findings.
- Preserve severity/scope: required changes, open questions, optional nonblocking
  suggestions. Politeness must not obscure blockers.
- No unrelated refactor as a condition of a bounded fix. Follow the requested
  review schema/template, not mode-specific headings.

## Synthetic example

Private fixture, not a thread reply: retry continues after cancellation,
unbounded; cancellation must be honored; extracting a helper is optional.

> The unbounded retry continues after cancellation. It must honor cancellation
> so callers can stop the work. A shared helper could reduce duplication, but
> that refactor need not block this fix.
