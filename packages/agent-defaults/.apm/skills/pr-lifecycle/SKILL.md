---
name: pr-lifecycle
description: >
  End-to-end PR management from creation through merge and cleanup.
  Covers: opening draft PRs, finalizing descriptions, addressing review
  feedback, monitoring CI, waiting for Copilot code review, and
  post-merge session cleanup. Use whenever a task ends in a new PR,
  when iterating on an existing PR, or when monitoring CI/review status.
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

For PR titles and bodies, load `writing-voice` and its
`references/artifact-authoring.md` for authoring and the final pre-post reader
check. Use `acting-on-behalf` for posting permission and conditional attribution.
This applies to early drafts and later updates. Check applicable PR templates
in the repository root, `docs/`, and `.github/`, including template directories,
before either phase; apply the canonical template and content rules there.

## Trigger phrases

- "create a PR", "open a draft PR", "push this and open a PR"
- "address PR feedback", "respond to review comments", "iterate on a PR"
- "watch CI", "monitor checks", "let me know when it's green"
- "wait for Copilot review", "watch for code review"

---

## Phase 1 — Early draft PR

For `feature`, `bugfix`, and `refactor` flows:

1. As soon as a branch exists, open a **draft PR** with a valid title from the
   start, never a placeholder like `WIP: <goal>`. Follow the repository's
   required title format. Only if none is specified, use Conventional Commits.
   Adapt this concrete, non-interactive example to the task:
   ```bash
   gh pr create --draft --title "fix: handle missing login data" --body "Prevent a crash when login data is missing."
   ```
   - Default `<type>` from the canonical flow (`feature` → `feat`, `bugfix` →
     `fix`, `refactor` → `refactor`) and derive `<description>` from the
     goal — this mapping is a default, not an absolute. If the actual
     initial change is clearly `docs`, `test`, `chore`, `ci`, `perf`,
     `build`, or `revert` work, use that type instead.
   - Validate the title against § Title format before creating the PR.
2. Skip for `research` flows or when the user explicitly declines.

## Phase 2 — Implementation & gates

Work proceeds through the calling agent, with optional `implementer` delegation
and review gates (`review-fix-loop`). No coordinator agent is required.
The PR remains in draft until all gates pass.

## Phase 3 — Finalize PR

When implementation is complete and gates pass:

1. Recheck the applicable PR template and preserve its structure and required
   answers under `writing-voice`'s artifact-authoring rules.
2. Follow the repository's title format. For the default Conventional format,
   re-derive and correct the complete header — `<type>`, optional scope,
   optional `!`, and wording — from the final diff, not from the Phase 1 goal.
   The title already follows the chosen format from Phase 1; this step
   **corrects/refines** that header (the
   flow-default type may no longer fit, or a scope may now materially
   clarify the change) — it is never a deferred WIP-to-Conventional
   conversion. Validate against § Title format, then update using the
   corrected title itself (not the unscoped template — the corrected
   scope and `!` must survive):
   ```bash
   gh pr edit <number> --title "<validated-conventional-title>"
   ```
3. Rewrite the body using `writing-voice`, including its validation-detail
   rules. Follow the repository template when present; otherwise use only the
   structure this change needs. Preserve relevant issue and ADR references
   and apply conditional AI attribution via `acting-on-behalf`.
   PR-body attribution is not part of feedback processing:
   `pr-feedback-review` never decides attribution. `acting-on-behalf` is the
   sole source of truth for whether a PR body needs AI attribution.
4. Validate the title against § Title format, then mark ready for review:
   ```bash
   gh pr ready <number>
   ```

## Title format

First use the repository's required title format in every phase. If it differs
from Conventional Commits, validate that format instead of the regex below.
For example, a repository requiring a ticket prefix keeps that prefix.

Only when the repository supplies no title format, use these Conventional
Commits defaults for titles created or updated in Phase 1 and Phase 3:

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
  This regex validates only the default Conventional format, not a different
  repository-required format.

## Phase 4 — Monitor CI

After every push, record the repository, PR number, and pushed head SHA. Read
live PR state, then load [PR monitoring](references/pr-monitoring.md).
It owns capability selection, the single monitoring owner, bounded waits,
failure handling, and final exact-head verification. Reuse an existing
delegated controller or available PR/head-aware notifications. Availability
never grants permission to enable Agent merge, create automation, or merge.

CLI/cloud fallback when no native monitor or controller owns the work,
under the reference's deadline and permission rules:

```bash
gh pr checks <number> --repo <owner/repo> --watch --fail-fast
```

Native notifications are wakeups, not proof of success. Recheck live head and
all applicable checks before reporting CI passed. Report missing, failed,
stale, unavailable, or timed-out checks explicitly; do not loop model turns
to poll or treat no status as success.

## Phase 5 — Wait for Copilot code review

Load [PR monitoring](references/pr-monitoring.md) for expected-review evidence
and the bounded notification/wait policy. No review yet does not mean disabled.
Skip speculative waits when no review is configured/expected; report unknown
expectation or timeout as a gap, never a satisfied required review gate.

Retrieve arrived reviews through `human-interaction-safeguard`, for example:

```bash
gh api --paginate "repos/{owner}/{repo}/pulls/{number}/reviews" \
  --jq '[.[] | select((.user.type == "Bot" or .performed_via_github_app != null) and ((.user.login // "") | startswith("copilot-pull-request-reviewer")))]'
```

- The login prefix identifies Copilot only after authoritative Bot/App metadata
  establishes `AUTOMATION_FLOW`; it never classifies the actor.
- This review listing alone is not complete thread/chain retrieval. Phase 6
  remains mandatory before processing feedback.
- Categorize permitted automated findings and feed actionable ones into
  `review-fix-loop`. Skipping an unconfigured wait never skips mandatory
  adversarial, security, or repository-required review gates.

## Phase 6 — Process review feedback

Retrieve PR review comments, reviews, issue/PR comments, and GraphQL review
threads using the exact `gh api` commands in `human-interaction-safeguard`.
Do not classify actors from `gh pr view --json reviews,comments` or login text.
Exhaust both `reviewThreads` pages and every thread's independent `comments`
pages. Incomplete or failed pagination is `HUMAN_STOP` before automation.
Apply the thread/chain taint rule after retrieval: `AUTOMATION_FLOW` requires
every root comment and reply to have authoritative Bot/App metadata. Any
`HUMAN_STOP` item taints the entire chain, so no comment in it may trigger
implementation, an agent reply, or agent resolution.

Apply `human-interaction-safeguard` first. It is the sole source of truth for
actor classification and behavior:

- `HUMAN_STOP` → by default, return control to the user; do not initiate a change
  from the interaction, draft or post a reply, or resolve the thread. A later, separate,
  explicit implementation instruction may authorize code/config/test work;
  reply and resolution require their own approval.
  Defer any single-action exception exclusively to `human-interaction-safeguard`:
  warn about human interaction and obtain ordinary explicit user confirmation
  for the described action and target. Its authorization permits only that action,
  not lifecycle iteration, another operation, or classification as automation.
- `AUTOMATION_FLOW` → use `pr-feedback-review`.

After pushing fixes, request another review only when repository policy or
the user's delegation calls for it, through the existing lifecycle owner:
```bash
gh pr edit <number> --add-reviewer <reviewer>
```

Resume Phase 4 for the new head after any push; reuse its monitoring owner.

## Phase 7 — Loop exit conditions

| Condition | Action |
|-----------|--------|
| Exact-head CI verified, required approvals/reviews and mandatory gates satisfied, no unresolved blocking feedback | Report readiness; merging still needs independent permission |
| Checks/review pending, unavailable, unknown, timed out, or for an old head | Report the gap and yield; do not claim readiness |
| PR merged | Phase 8 (cleanup) |
| PR closed | Notify user, stop |
| User says stop | Stop |
| 10 iterations reached | Stop, report unresolved items |

Yield control between iterations. A completion event may resume the existing
owner; do not create another controller or schedule polling to fill the wait.

## Phase 8 — Post-merge cleanup

After the PR is **merged**:

1. `list_sessions_and_chats` → find sessions tied to the merged PR.
2. `archive_session` on those sessions (preserves history, frees worktrees).

---

## Skill fallbacks

| Missing tool | Fallback |
|-------------|----------|
| `create_pull_request` (built-in) | `gh pr create --draft --title "<type>: <description>" --body "<problem/value summary + relevant issue ref>"` (non-interactive — never a bare `gh pr create --draft` with no `--body`, and never a `WIP:` placeholder); validate the title against § Title format first |
| Native monitoring unavailable | Phase 4 portable fallback with exact-head verification and one bounded wait |
| `gh pr checks --watch` unavailable | PR monitoring reference: verified-head `gh run watch` under the same deadline |
| `stage-pr` | Report staging unavailable |

## Pre-requisites

- `human-interaction-safeguard` — source of truth for actor behavior.
- `acting-on-behalf` — posting and attribution backstop.
- `writing-voice` — shared authoring and final reader check.
- `pr-feedback-review` — bot/app feedback handling after actor classification.
- `review-fix-loop` — for gate iteration.
- `commit-message-storyteller` — for commit messages during fixes.
