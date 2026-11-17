---
description: Canonical skill entrypoints and mandatory interaction, posting, and review gates.
---

# Skill gates

Load applicable skills, not every workflow. These entrypoints do not replace
their policies or grant permission.
Missing mandatory safeguards block the gated action; report the missing
dependency rather than invent a weaker path.

## Gate meaning and conflict handling

A gate is a hard action precondition owned by a skill or repository rule.
Repository requirements may replace companion-skill defaults only where the
owning skill permits it. A user or repository may waive a mandatory gate only
where its owner explicitly allows that waiver. If explicit requirements
conflict and their owners do not resolve precedence, stop and report both;
never infer a waiver or weaken either requirement. Use only a fallback the
owner names for that gate. Otherwise, report the missing dependency and stop.

## Reusing review-gate acceptance

When multiple instructions require the same review gate, reuse a recorded
acceptance only for that same gate and reviewer policy, exact unchanged diff,
review scope, context, and requirements. Record those inputs with the verdict,
confidence, and findings so the match can be checked. Any changed diff, scope,
context, requirements, incomplete evidence, or unresolved blocker invalidates
reuse and requires a fresh review. Distinct gates, including correctness and
security review, are never substitutes for each other. This reuse applies only
to local review-gate acceptance; never reuse stale CI, PR, branch, or remote
readiness evidence.

## Cross-workflow requirements

- Written communication: `writing-voice` owns authoring, evidence, and the final
  reader check. Preserve required repository formats.
- Existing public GitHub interactions: apply `human-interaction-safeguard`
  before research, implementation, drafting, posting, or resolution from the
  interaction. If unavailable, fail closed as `HUMAN_STOP`. It owns actor and
  complete-chain classification; writing guidance never overrides it.
- Authorization questions in any workflow: load `human-interaction-safeguard`
  for its canonical **Unattended decision handling** when confirmation is
  unanswered or unavailable. This reporting rule grants no authorization.
- Public/shared posts: load `acting-on-behalf` for permission, attribution,
  and the mandatory audience-specific disclosure check. That boundary applies
  to every public or shared destination and overrides body-preservation,
  tracking, and citation instructions. If it is unavailable or disclosure is
  uncertain, fail closed.
  PR creation/management uses `pr-lifecycle`; bot/app feedback permitted by the
  interaction gate uses `pr-feedback-review`. Reviewing another author's PR
  uses `pr-review-protocol`. Do not duplicate their detailed policies.
- Git publication actions: load `git-publishing-safety` before creating or
  rewriting commits, rebasing, pushing, force-pushing, or opening a PR.
- Repository access: load `repository-access` when locating repositories,
  inspecting local or remote state, citing repository findings, or changing
  APM-managed skills and plugins.
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
  `datadog-url-router` from `code-reviewers`. If the skill is unavailable, stop
  Datadog access and report that the skill is unavailable; do not substitute
  web fetching or an invented access path.
