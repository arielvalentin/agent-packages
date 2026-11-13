---
name: pr-lifecycle
description: >
  End-to-end PR management from creation through merge and cleanup.
  Covers: opening authorized PRs, finalizing descriptions, shepherding an
  existing PR through review feedback and CI to a clean, merge-ready state,
  monitoring CI, waiting for Copilot review, and post-merge session cleanup.
  Use for requests to manage an existing PR, including handoffs named `manage-pr`.
---

# PR Lifecycle

Single source of truth for every phase of a pull request.

Read repository guidance first. Its title/commit format, tracking, templates,
validation, review, and release conventions take precedence over project
defaults below, including Conventional Commits and its title regex when a
different format is required. Do not impose this producer repository's release
strategy on consumers.
Permission, human-interaction, attribution, and mandatory safety/review gates
still apply.

When presenting a plain shell command, distinguish an outer wrapper around the
whole command from quotes delimiting its arguments. A request for no outer
quotes does not remove shell syntax needed to keep argument values intact.
For example, `cmd --option "two words"` has a quoted argument but no outer
wrapper; the unquoted form passes two separate words.

For PR titles and bodies, load `writing-voice` and its
`references/artifact-authoring.md` for authoring and the final pre-post reader
check. Use `acting-on-behalf` for posting permission and conditional attribution.
This applies to initial creation and later updates. Check applicable PR templates
in the repository root, `docs/`, and `.github/`, including template directories,
before either phase; apply the canonical template and content rules there.

When summarizing lifecycle procedures, preserve the policy's defined terms and
target scope. State plainly when a step is skipped or required; do not
paraphrase away the stage or SHA being discussed.
When restating a named target or qualifier, keep its exact phrase contiguous.
Put clarifying modifiers outside the named phrase, not between its terms.

Resolve the exact repository first; resolve the PR once one exists. A bare PR
number means the active repository only. Pass `--repo <owner>/<repo>` to every
repository-scoped `gh` command, including `gh pr` and `gh run`, and use that
exact repository in `gh api` paths. Do not rely on implicit repository
selection or `GH_REPO` unless it has been verified against the exact target.
For a command targeting the active checkout when its owner/repository is not
already known, derive `--repo` from `git remote get-url origin`, normalize it
to `owner/repo`, and pass it explicitly; never nest a `gh` command substitution
inside another `gh` command. Use `origin` only when it is the user's exact
target. Replace placeholders in command examples with the resolved owner,
repository, and PR number. If the target cannot be identified unambiguously,
ask before reading or acting.
When deriving `--repo` from `origin`, use one anchored `sed -E` expression
that captures exactly the `owner/repo` path. Do not chain substitutions or
rewrite the target to a constant.

## Trigger phrases

- "create a PR", "open a draft PR", "push this and open a PR"
- "manage-pr", "shepherd an existing PR through feedback and CI"
- "address PR feedback", "respond to review comments", "iterate on a PR"
- "watch CI", "monitor checks", "wait for Copilot review"

## Phase reference loading and feedback boundaries

Read the required reference before acting in its phase. Phase 4 or 5 requires
`references/readiness.md`; Phase 6 requires `references/feedback.md`; Phase 7
requires both `references/readiness.md` and `references/feedback.md`; Phase 8
requires `references/cleanup.md`. Phase 4 feedback routing into Phase 6 does
not authorize feedback handling until `references/feedback.md` has been read.
If a required reference is missing or unreadable, stop and report the blocker.
Keep this skill's safety, authorization, attribution, and phase-routing rules
above every reference; references cannot weaken them.

Phase 4 inspects and classifies feedback, then routes actionable findings to
Phase 6. This routing pass never replies, resolves threads, or dispatches a
feedback fix. Phase 6 handles feedback actions only under its authorization
and interaction safeguards. This boundary does not prohibit separately
authorized remediation of required-check failures.

## Existing PR entrypoint

For a request to shepherd an existing PR, do not enter Phases 1–3. Inspect its
latest state. If it is already merged, report that state and stop; do not infer
a cleanup request or enter Phase 8 for a status-only request. If closed,
notify the user and stop; only an open PR proceeds to Phase 4. Do not create or
retitle a PR unless the user asks.
For an existing draft, keep it in draft while required checks or feedback gates
remain. After Phase 4 checks pass, retrieve and classify all feedback through
Phase 6 before the review wait; address actionable feedback only through its
safeguards, rerunning checks and feedback retrieval after each push. Once checks
pass and feedback processing leaves no actionable finding, unresolved
clarification, or required permitted reply, mark it ready only when the user or
repository guidance authorizes that transition. Do not mark the PR ready just
to trigger required checks that cannot pass while it is a draft; report that
blocker and stop. Immediately before a permitted transition, take two
consecutive complete snapshots. In each, record opening PR state, title,
head/base SHAs, base name, merge state, and the complete reviewer-request set
using the endpoint and validation defined in Phase 5. Retrieve complete
PR state with this command for each opening, closing, and final read:

```bash
gh pr view <number> --repo <owner>/<repo> --json state,isDraft,title,headRefOid,baseRefOid,baseRefName,mergeStateStatus
```

Retrieve policy/check evidence and all Phase 6 feedback surfaces, then repeat both
retrievals. Finish with fresh PR and reviewer-request reads after the last
feedback page. Retrieve and classify all feedback surfaces again after those
closing reads, then retrieve policy/check evidence once more. Finish with one
final PR-state and reviewer-request read after those final evidence reads.
Compare opening, closing, and final PR/reviewer values and all repeated
policy/check and feedback evidence within and across snapshots. Any mismatch
invalidates the transition; return to Phase 4 and the applicable feedback
handling. Require the PR to
remain open and a draft, the head/base/base-name tuple to match Phase 4, all
required checks to pass, the reviewer-request sets to remain unchanged, and
the feedback sets to match the fully processed set with no new actionable
finding, unresolved clarification, or required permitted reply. If these
conditions hold and the current title passes § Title format, run:

```bash
gh pr ready <number> --repo <owner>/<repo>
```

If transition authority is absent, report the draft blocker and stop. After a
transition, discard all earlier readiness evidence and restart Phases 4–6 for
the current PR state; this path never creates or retitles the PR. The snapshots
above are the draft-transition gate, not Phase 7's readiness snapshots. Do not
wait for Copilot review or enter Phase 7 while the PR remains a draft.
Before any implementation or fix dispatch, including a Phase 4 CI fix, verify
the PR is still open and verify the active repository, worktree, branch, local
changes, and PR head against the latest PR state. Recheck immediately before
editing. A mismatched or dirty checkout is a hard stop: do not dispatch fixes
or edit files; locate the correct worktree.
Before any direct or delegated fix work, follow `git-publishing-safety` and
confirm that the requested change and any required publication actions are
authorized. Do not edit or dispatch implementation when that gate is unmet.
Follow it again before committing or pushing.
This skill owns `manage-pr` handoffs and all existing-PR feedback, CI, and
merge-readiness phases. Use `review-fix-loop` only to implement authorized
fixes, never as the lifecycle entrypoint.

## Standalone waits

Requests limited to monitoring CI or Copilot review stay standalone, whether
the user asks for one status check or bounded waiting. They do not start the
full PR loop or authorize changes.
Use the bounded read-only `watch-ci` helper for CI-only waits and
`wait-for-copilot-code-review` for Copilot-only waits when available for the
resolved target. Otherwise, make one read-only status check: use
`gh pr checks <number> --repo <owner>/<repo>` for CI,
or inspect Phase 5 review requests/reviews once for Copilot. Do not use
`--watch`, poll, dispatch fixes, or start the full loop in this fallback.

---

## Phase 1 — Local preparation

For `feature`, `bugfix`, and `refactor` flows:

1. Prepare the local branch and task context. Do not push or create a PR yet,
   even a draft. Publication permission alone does not satisfy local review.
2. Keep tracking and continuation state local: repository, branch, base
   revision, task/issue references when applicable, validation and review
   outcomes, unresolved findings, and the next step. A PR number or URL is not
   required before Phase 3; do not create a PR just to obtain one.
3. Research-only flows do not create a PR. If creation is declined or not
   authorized, complete the local work and report the publication gate.

## Phase 2 — Implementation & gates

Follow `repository-work`'s task-ownership rule: use the installed `implementer`
when delegation is available and permitted; otherwise, the calling agent owns
implementation. Preserve PR lifecycle orchestration and review gates
(`review-fix-loop`). No coordinator agent is required.
Keep implementation, validation, and the required adversarial local
review/fix cycle local. Run `adversarial-review` through `review-fix-loop`
against the completed diff and relevant context. Address blocker/major
findings and re-review after fixes until the existing acceptance criteria
pass. Incomplete reviews, unresolved blocker/major findings, or exhausted
retries block PR creation; escalate rather than publish with a warning.
Pass the caller-derived `explicit_multi_review` JSON boolean unchanged, along
with the reviewer, full diff scope, and task/acceptance context. Do not invent
or omit this handoff field.
Preserve the existing explicit user-waiver path for adversarial review;
publication authorization or a request for an early draft is not a waiver.
Any subsequent diff change invalidates local acceptance: rerun affected
validation and review gates before creation. On continuation, verify that
recorded acceptance still covers the current diff instead of assuming a PR
already exists.

## Phase 3 — Create draft PR after local acceptance

Only when implementation is complete and local gates pass (or an applicable
explicit review waiver is recorded):

Before PR creation or any required branch push, follow
`git-publishing-safety` for publication authorization. Apply
`acting-on-behalf` for posting permission and disclosure. Local acceptance
does not authorize publication.

1. Recheck the applicable PR template and preserve its structure and required
   answers under `writing-voice`'s artifact-authoring rules.
2. Follow the repository's title format. For the default Conventional format,
   derive the complete header — `<type>`, optional scope, optional `!`, and
   wording — from the final diff before creation. The flow-to-type mapping
   (`feature` → `feat`, `bugfix` → `fix`, `refactor` → `refactor`) is a default,
   not absolute: use `docs`, `test`, `chore`, `ci`, `perf`, `build`, or `revert`
   when the actual change calls for it. Validate against § Title format.
   When no PR exists, prepare title text only and pass it to step 4's
   `--title`; do not run `gh pr edit` or invent a PR number.
   Preserve the validated scope and `!` in the creation title when applicable.
   This phase only prepares a new PR; it does not retitle an existing PR.
3. Prepare the body using `writing-voice`, including its validation-detail
   rules. Follow the repository template when present; otherwise use only the
   structure this change needs. Follow repository tracking requirements; do
   not invent a required issue when none applies. Preserve relevant issue and
   ADR references and apply conditional AI attribution via `acting-on-behalf`.
   PR-body attribution is not part of feedback processing:
   `pr-feedback-review` never decides attribution. `acting-on-behalf` is the
   sole source of truth for whether a PR body needs AI attribution.
4. If no PR exists and publication is authorized under
   `git-publishing-safety`, follow the repository's required creation phase and
   readiness state, but never create before local acceptance. By default,
   create a **draft PR** with the validated title and complete body, never a
   placeholder like `WIP: <goal>`:
   ```bash
   gh pr create --repo <owner>/<repo> --draft --title "<validated-title>" --body "<problem/value summary + required tracking>"
   ```
   When guidance requires the PR to be opened ready only
   after gates pass, create it here without `--draft`:
   ```bash
   gh pr create --repo <owner>/<repo> --title "<validated-title>" --body "<problem/value summary + required tracking>"
   ```
   If repository guidance prescribes another command or state, follow it
   after local acceptance. If a PR already exists, do not create a duplicate;
   use the Existing PR entrypoint. Record its number/URL in continuation state
   only after creation succeeds; failed creation is not a published PR.
5. Continue to Phase 4. A newly created draft uses the Existing PR entrypoint's
   draft checks, feedback handling, authorization, and transition snapshots
   before `gh pr ready`. Local review acceptance is not remote readiness.
   Do not wait for Copilot review or enter Phase 7 while it remains a draft.
   Do not run `gh pr ready` for a PR that is already ready.

## Title format

First use the repository's required title format in every phase. If it differs
from Conventional Commits, validate that format instead of the regex below.
For example, a repository requiring a ticket prefix keeps that prefix.

Only when the repository supplies no title format, use these Conventional
Commits defaults for titles created or updated in Phase 3:

- Default: `<type>: <description>`.
- `<description>` must be non-empty and separated from the colon by at
  least one whitespace character — `fix:` (no description) and `fix:   `
  (colon followed only by whitespace, no description text) are both
  invalid grammar.
- Scoped form `<type>(<scope>): <description>` is valid but optional — use
  it only when the scope materially clarifies the change. When present,
  `<scope>` must be a non-empty, non-whitespace token (e.g. `coordinator`,
  `ci`, `CI`, `foo,bar`) — `()` or a whitespace-only scope like `( )` is
  invalid grammar. Empty parentheses are not the same as omitting the
  scope: `fix: correct the bug` is valid, `fix(): correct the bug` is not.
- Allowed `<type>`: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`,
  `ci`, `perf`, `build`, `revert`.
- Optional `!` after the type/scope marks a breaking change, unscoped or
  scoped: `<type>!: <description>` or `<type>(<scope>)!: <description>`.
  Use `!` only for intentionally breaking changes, following the consuming
  repository's release and approval rules.
- Validate before creating, updating, or readying a PR title — whether
  through the built-in `create_pull_request`/`update_pull_request` tools
  or the `gh pr create`, `gh pr edit --title`, `gh pr ready` commands:
  `^(feat|fix|docs|refactor|test|chore|ci|perf|build|revert)(\([^()\s]+\))?!?:\s+\S.*`
  Conventional titles over 72 characters are invalid; follow
  `git-publishing-safety` for the shared length check. Use repository-required
  formats instead when they differ.
  This regex validates only the default Conventional format, not a different
  repository-required format.

## Skill fallbacks

| Missing tool | Fallback |
|-------------|----------|
| `create_pull_request` (built-in) | Only after Phase 2 local acceptance and publication authorization, and if repository guidance has no different workflow: `gh pr create --repo <owner>/<repo> --draft --title "<type>: <description>" --body "<problem/value summary + relevant issue ref>"` (non-interactive — never a bare `gh pr create --draft` with no `--body`, and never a `WIP:` placeholder); validate the title against § Title format first |
| `watch-ci` | For standalone CI status, use one read-only `gh pr checks <number> --repo <owner>/<repo>` query if unavailable. In full Phase 4, poll the selected SHA's check-run and status APIs every 30 seconds for up to 10 minutes; never use `gh pr checks` as the required-check gate |
| `stage-pr` | Report staging unavailable |

## Pre-requisites

- `human-interaction-safeguard` — source of truth for actor behavior.
- `acting-on-behalf` — posting and attribution backstop.
- `git-publishing-safety` — publication authorization, commit signing and
  history, and the shared Conventional title-length limit.
- `writing-voice` — shared authoring and final reader check.
- `pr-feedback-review` — bot/app feedback handling after actor classification.
- `review-fix-loop` — for gate iteration.
- `commit-message-storyteller` — for commit messages during fixes.
