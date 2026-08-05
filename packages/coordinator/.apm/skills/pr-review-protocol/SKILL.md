---
name: pr-review-protocol
description: >
  Context-aware protocol for reviewing someone else's pull request. Gates on
  CI, establishes intent, reviews the diff and system impact, checks docs and
  tooling coverage, and posts one evidence-backed review.
---

# PR Review Protocol

Use this protocol whenever the user asks to review a pull request authored by
someone else. The goal is a thorough, context-aware review, not just a diff
scan.

Resolve the canonical `owner/repo` and PR number or URL once. Pass both through
every command and handoff; never rely on the current working directory to select
the repository.

## 1. CI gate

Before any review work:

1. Run `gh pr checks <pr-number> --repo <owner/repo> --required` or inspect
   `statusCheckRollup` with `gh pr view --repo <owner/repo>`.
2. If any required check is pending or failing, stop and tell the user which
   checks failed or are still running, and that review begins once CI is green.
3. Proceed only after all required checks pass.

## 2. Establish intent

Understand why the change exists before reviewing its implementation:

1. Fetch the PR body, diff, checks, and metadata once. Save reusable context as
   artifacts so panel members do not repeat GitHub queries.
2. Read the PR description for the problem and rationale.
3. Read linked issues once for acceptance criteria and prior discussion; add
   their content to the shared context artifact.
4. If the changed area is unfamiliar, dispatch one well-scoped `research`
   agent per source to find related files, prior changes, and architectural
   patterns. Do not duplicate identical research for consensus.
5. If the intent remains unclear, treat that as review feedback.
6. Summarize the intent; use it to anchor the rest of the review.

## 3. Diff-scoped review

Run `code-review` against the saved PR diff through `consensus-panel`. Pass
artifact paths to each panel member and instruct them not to refetch PR context:

- Focus on high-confidence bugs, security vulnerabilities, and logic errors.
- Flag broken contracts, missing error handling, and edge cases.
- Note test gaps for changed behavior.
- Require evidence for every finding: official documentation, specifications,
  related issues or PRs, or repository conventions.

## 4. Adversarial intent coverage

Run `adversarial-review` through `consensus-panel` with the saved intent
summary, linked issue context, and diff artifacts. Instruct panel members not
to refetch PR context. Ask them to determine:

1. Whether the diff fully implements the stated intent and acceptance criteria.
2. Whether claimed scenarios, edge cases, error paths, concurrency, or rollback
   behavior are incomplete.
3. Whether shared code, defaults, or public API contracts could regress.

## 5. System impact

Evaluate concerns beyond the changed lines:

- **Blast radius**: shared libraries, middleware, infrastructure, or consumers.
- **Performance**: hot paths, N+1 queries, memory, or scaling risks.
- **Observability**: changed or removed metrics, logs, traces, alerts, or SLOs.
- **Data/schema**: migrations, compatibility, and integrity.
- **Deployment**: feature flags, phased rollout, or cross-team coordination.

Escalate apparently small changes that touch high-impact areas.

## 6. Documentation impact

Search for documentation describing changed behavior, including README files,
`docs/`, wiki links, diagrams, and referenced images.

- If impacted documentation exists but is not updated and no follow-up task is
  linked, ask whether it will be updated and link the affected files.
- If no related documentation is found, do not add generic documentation
  feedback.

## 7. Tooling coverage

Assess whether available reviewers and tools cover the languages and frameworks
in the diff.

- Disclose gaps that may hide language-specific idiom or safety issues.
- Tell the user which limitations affect this review.
- Suggest a specific tool or reviewer when one is known.
- Never claim comprehensive coverage without adequate tooling.

## 8. Post one review

Compile steps 3-7 into one review:

1. Intent summary and whether the change achieves it.
2. Findings ordered by severity: blocking, warning, informational.
3. System-impact concerns.
4. Documentation gaps only when supported by repository evidence.
5. Tooling limitations.
6. Verdict: approve, request changes, or comment-only, with rationale.

Invoke `acting-on-behalf` before posting. Use `gh pr review` with `--approve`,
`--request-changes`, or `--comment`, always passing the PR number and
`--repo <owner/repo>`, and include the required AI disclaimer.

## Boundaries

- Do not review before required CI is green.
- Do not post unsupported opinions.
- Do not fan out identical research to build consensus.
- Do not post multiple fragmented reviews when one synthesized review suffices.
