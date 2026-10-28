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
   required title format. Only if none is specified, use Conventional Commits:
   ```bash
   gh pr create --draft --title "<type>: <description>" --body "<problem/value summary + relevant issue ref>"
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
2. Refine the existing title from the final diff, not the initial flow label.
   The title must already follow the repository's format from creation; this
   is not a first-time format conversion. Validate the complete revised header
   against § Title format, preserving any justified scope and breaking marker:
   ```bash
   gh pr edit <number> --title "<validated-conventional-title>"
   ```
3. Rewrite the body under `writing-voice` and the repository template. Preserve
   issue/ADR references. `acting-on-behalf` alone decides conditional AI
   attribution, not `pr-feedback-review` or another lifecycle stage.
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
- Scope policy: omit it by default. A grammatically valid scope is still
  prohibited when it does not materially clarify the change.
  Scoped syntax is `<type>(<scope>): <description>`. The scope must be a
  non-empty, non-whitespace token such as `coordinator` or `ci`.
  `fix: correct the bug` is valid; `fix(): correct the bug` and
  `fix( ): correct the bug` are invalid because their scopes are empty or
  whitespace-only.
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

Use one monitoring owner per PR. Prefer available PR/head-aware native status
and notifications under the user's delegation; do not start a duplicate watcher
or fix loop after each push. Capability alone does not authorize enabling Agent
merge, scheduling automation, posting, or merging. Native mechanics must preserve
all repository, actor/chain, review, and independent approval gates.

Without a usable native path, the portable PR-check command is:

```bash
gh pr checks <number> --repo <owner/repo> --watch --fail-fast
```

Use one CLI wait bounded by the client's deadline. If `--watch` is unavailable
or no bounded wait is possible, read the current check status once without
`--watch` and hand off pending. Stop only the local watcher at the deadline,
not the GitHub workflow; do not poll through model turns.

On failure, inspect `gh run view <run-id> --repo <owner/repo> --log-failed`;
the existing owner handles authorized fixes and rechecks the new head.
Before reporting success, verify live PR state, current head SHA and all
applicable terminal check results. Notifications or old-head results are not
proof. Require successful conclusions, honoring repository skipped/neutral rules.
Missing, inaccessible, failed, cancelled, or timed-out checks remain
explicit gaps with URLs, never success. A changed head invalidates prior results.

## Phase 5 — Wait for Copilot code review

Wait only when a configured rule/workflow, authoritative review request, or
explicit user request establishes that review is expected. An empty review
list does not establish that it is disabled. Skip invented waits otherwise;
report inaccessible/unknown configuration, not "review passed".
When expected, reuse the owner/notification or one bounded wait, never model-turn
polling. Timeout remains pending; required reviews still block readiness.
Apply repository re-review rules to the current head.

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
  warn about human interaction and obtain ordinary explicit user confirmation.
  If that safeguard verifies approval for the exact pending action, target and
  body, and all independent gates pass, perform that action once. Explicit
  posting approval permits that post, not resolution or lifecycle iteration.
  A fix approval alone permits neither posting nor resolution. Classification
  remains `HUMAN_STOP`; incomplete metadata or chain retrieval cannot be overridden.
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
| `gh pr checks --watch` unavailable | Read check status once without `--watch`, report pending, and yield |
| `stage-pr` | Report staging unavailable |

## Pre-requisites

- `human-interaction-safeguard` — source of truth for actor behavior.
- `acting-on-behalf` — posting and attribution backstop.
- `writing-voice` — shared authoring and final reader check.
- `pr-feedback-review` — bot/app feedback handling after actor classification.
- `review-fix-loop` — for gate iteration.
- `commit-message-storyteller` — for commit messages during fixes.
