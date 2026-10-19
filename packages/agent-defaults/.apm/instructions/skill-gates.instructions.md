---
description: Canonical skill entrypoints and mandatory interaction, posting, and review gates.
---

# Skill gates

Load applicable skills, not every workflow. These entrypoints do not replace
their policies or grant permission. Missing mandatory safeguards block the
gated action; report the missing dependency rather than invent a weaker path.

- Written communication: `writing-voice` owns authoring, evidence, and the final
  reader check. Preserve required repository formats.
- Existing public GitHub interactions: apply `human-interaction-safeguard`
  before research, implementation, drafting, posting, or resolution from the
  interaction. If unavailable, fail closed as `HUMAN_STOP`. It owns actor and
  complete-chain classification; writing guidance never overrides it.
- Public/shared posts: load `acting-on-behalf` for permission and attribution.
  PR creation/management uses `pr-lifecycle`; bot/app feedback permitted by the
  interaction gate uses `pr-feedback-review`. Reviewing another author's PR
  uses `pr-review-protocol`. Do not duplicate their detailed policies.
- Code/config/script PRs require `adversarial-review` before creation, except
  an explicit user waiver. Agent/skill instructions, safeguards, workflows,
  and contract checks are behavior-defining configuration: they require
  `adversarial-review` before completion, not a documentation-only exemption.
  Security-sensitive changes also
  require `security-review`; explicit vulnerability reviews invoke it first.
- Before review handoffs, persist `explicit_multi_review` as a JSON boolean
  (`true` for explicitly requested consensus/panels/multiple independent
  reviewers, otherwise `false`); preserve it across retries. `consensus-panel` owns classification,
  dispatch, synthesis, and failure rules; `review-fix-loop` owns bounded fixes.
  Keep fixes in scope. Unresolved blocker/major findings or incomplete mandatory
  reviews stop completion; escalate repeated unresolved findings.
- Substantial multi-source or freshness-sensitive research uses `tech-research`.
  Simple lookups stay direct; do not duplicate fact-finding across models.
- Datadog URLs/IDs or logs/metrics/traces/audit/incidents use
  `datadog-url-router` from `code-reviewers`. If unavailable, stop Datadog access
  and report it; do not substitute web fetching or an invented access path.
