---
name: pr-lifecycle
description: >
  End-to-end PR management from creation through merge and cleanup.
  Covers: opening authorized PRs, finalizing descriptions, addressing review
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

1. Once opening a PR is authorized by the user's request or repository
   guidance, and the repository does not prescribe another workflow, open an
   early **draft PR** with a valid title from the start, never a placeholder
   like `WIP: <goal>`. A branch existing alone is not authorization. Follow the
   repository's required title format. Only if none is specified, use
   Conventional Commits:
   ```bash
   gh pr create --draft --title "<type>: <description>" --body "<problem/value summary + relevant issue ref>"
   ```
   - Default `<type>` from the canonical flow (`feature` → `feat`, `bugfix` →
     `fix`, `refactor` → `refactor`) and derive `<description>` from the
     goal — this mapping is a default, not an absolute. If the actual
     initial change is clearly `docs`, `test`, `chore`, `ci`, `perf`,
     `build`, or `revert` work, use that type instead.
   - Validate the title against § Title format before creating the PR.
   - Before running the command, confirm the head branch is already published
     or that the request or repository guidance also authorizes the required
     push. A PR request alone does not authorize an implicit push by `gh pr create`.
2. Skip for `research` flows, when the user explicitly declines, or when
   repository guidance prescribes a different PR workflow, including creating
   the PR only after implementation gates pass.

## Phase 2 — Implementation & gates

Work proceeds through the calling agent, with optional `implementer` delegation
and review gates (`review-fix-loop`). No coordinator agent is required.
When the repository workflow uses an early draft, keep the PR in draft until
all gates pass. Otherwise preserve the state required by repository guidance;
do not introduce a draft transition.

## Phase 3 — Finalize PR

When implementation is complete and gates pass:

1. If no PR exists, create it only when opening is authorized. Follow the
   repository's required creation phase and readiness state. When guidance
   requires the PR to be opened ready only after gates pass, create it here
   without `--draft`:
   ```bash
   gh pr create --title "<validated-title>" --body "<problem/value summary + required tracking>"
   ```
   Before running the command, confirm the head branch is already published
   or that the request or repository guidance also authorizes the required
   push. If repository guidance prescribes another command or state, follow it.
2. Recheck the applicable PR template and preserve its structure and required
   answers under `writing-voice`'s artifact-authoring rules.
3. Follow the repository's title format. For the default Conventional format,
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
4. Rewrite the body using `writing-voice`, including its validation-detail
   rules. Follow the repository template when present; otherwise use only the
   structure this change needs. Preserve relevant issue and ADR references
   and apply conditional AI attribution via `acting-on-behalf`.
   PR-body attribution is not part of feedback processing:
   `pr-feedback-review` never decides attribution. `acting-on-behalf` is the
   sole source of truth for whether a PR body needs AI attribution.
5. If the PR is in draft and the repository workflow calls for a
   ready-for-review transition, validate the title against § Title format,
   then mark it ready when all gates pass:
   ```bash
   gh pr ready <number>
   ```
   If repository guidance uses another workflow, follow its required state
   transition instead. Do not run `gh pr ready` for a PR that is already ready.

## Title format

First use the repository's required title format in every phase. If it differs
from Conventional Commits, validate that format instead of the regex below.
For example, a repository requiring a ticket prefix keeps that prefix.

Only when the repository supplies no title format, use these Conventional
Commits defaults for titles created or updated in Phase 1 and Phase 3:

- Keep Conventional Commit subjects and PR titles within the 72-character
  maximum in `git-publishing-safety`.
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
  For this Conventional format, also require the complete title to be no more
  than 72 characters; the regex does not enforce length. Use repository-required
  formats instead when they differ.
  This regex validates only the default Conventional format, not a different
  repository-required format.

## Phase 4 — Monitor CI

After every push, watch CI:

```bash
gh pr checks <number> --watch --fail-fast
```

**On failure:**
```bash
gh run view <run-id> --log-failed
```
- Categorize: test error, lint, build, timeout, flaky
- Dispatch `implementer` with failure context
- Re-run affected gates, push fix, re-watch

**On success:** proceed to Phase 5.

**Fallback:** If `--watch` unavailable, use `gh run watch <run-id>`.

## Phase 5 — Wait for Copilot code review

After CI passes, check for automated Copilot review:

```bash
gh api --paginate "repos/{owner}/{repo}/pulls/{number}/reviews" \
  --jq '[.[] | select((.user.type == "Bot" or .performed_via_github_app != null) and ((.user.login // "") | startswith("copilot-pull-request-reviewer")))]'
```

- The login prefix identifies Copilot only after authoritative Bot/App metadata
  establishes `AUTOMATION_FLOW`; it never classifies the actor.
- Poll every 30s, timeout after 10 minutes.
- If findings: categorize by severity, feed actionable ones into
  `review-fix-loop`.
- If no findings or timeout: proceed.
- If repo doesn't use Copilot review: skip and note.

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

After pushing fixes:
```bash
gh pr edit <number> --add-reviewer <reviewer>
```

Re-run Phase 4 after any push.

## Phase 7 — Loop exit conditions

| Condition | Action |
|-----------|--------|
| CI green AND all threads resolved | Notify user: ready to merge |
| PR merged | Phase 8 (cleanup) |
| PR closed | Notify user, stop |
| User says stop | Stop |
| 10 iterations reached | Stop, report unresolved items |

Yield control between iterations.

## Phase 8 — Post-merge cleanup

After the PR is **merged**:

1. `list_sessions_and_chats` → find sessions tied to the merged PR.
2. `archive_session` on those sessions (preserves history, frees worktrees).

---

## Skill fallbacks

| Missing tool | Fallback |
|-------------|----------|
| `create_pull_request` (built-in) | After PR creation is authorized and if repository guidance has no different workflow: `gh pr create --draft --title "<type>: <description>" --body "<problem/value summary + relevant issue ref>"` (non-interactive — never a bare `gh pr create --draft` with no `--body`, and never a `WIP:` placeholder); validate the title against § Title format first |
| `gh pr checks --watch` | `gh run watch <run-id>` |
| `stage-pr` | Report staging unavailable |

## Pre-requisites

- `human-interaction-safeguard` — source of truth for actor behavior.
- `acting-on-behalf` — posting and attribution backstop.
- `git-publishing-safety` — authorization, commit rules, and the shared
  Conventional Commit subject and PR title length cap.
- `writing-voice` — shared authoring and final reader check.
- `pr-feedback-review` — bot/app feedback handling after actor classification.
- `review-fix-loop` — for gate iteration.
- `commit-message-storyteller` — for commit messages during fixes.
