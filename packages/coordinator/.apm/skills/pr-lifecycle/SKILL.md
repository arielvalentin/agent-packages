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

## Trigger phrases

- "create a PR", "open a draft PR", "push this and open a PR"
- "address PR feedback", "respond to review comments", "iterate on a PR"
- "watch CI", "monitor checks", "let me know when it's green"
- "wait for Copilot review", "watch for code review"

---

## Phase 1 — Early draft PR

For `feature`, `bugfix`, and `refactor` flows:

1. As soon as a branch exists, open a **draft PR** with a Conventional
   Commits title from the start — never a placeholder like `WIP: <goal>`:
   ```bash
   gh pr create --draft --title "<type>: <description>" --body "<issue ref + placeholder>"
   ```
   - Default `<type>` from the canonical flow (`feature` → `feat`, `bugfix` →
     `fix`, `refactor` → `refactor`) and derive `<description>` from the
     goal — this mapping is a default, not an absolute. If the actual
     initial change is clearly `docs`, `test`, `chore`, `ci`, `perf`,
     `build`, or `revert` work, use that type instead.
   - Validate the title against § Title format before creating the PR.
2. Skip for `research` flows or when the user explicitly declines.

## Phase 2 — Implementation & gates

Work proceeds via `implementer` and review gates (`review-fix-loop`).
The PR remains in draft until all gates pass.

## Phase 3 — Finalize PR

When implementation is complete and gates pass:

1. Check for a PR template:
   - `.github/PULL_REQUEST_TEMPLATE.md` (single)
   - `.github/PULL_REQUEST_TEMPLATE/` (directory)
   - Follow the template structure; write "N/A" for inapplicable sections.
2. Re-derive and correct the complete Conventional header — `<type>`,
   optional scope, optional `!`, and wording — from the final diff, not
   from the Phase 1 goal. The title is already in Conventional Commits
   format from Phase 1; this step **corrects/refines** that header (the
   flow-default type may no longer fit, or a scope may now materially
   clarify the change) — it is never a deferred WIP-to-Conventional
   conversion. Validate against § Title format, then update using the
   corrected title itself (not the unscoped template — the corrected
   scope and `!` must survive):
   ```bash
   gh pr edit <number> --title "<validated-conventional-title>"
   ```
3. Rewrite body to include:
   - **Intent** — why the change exists
   - **Changes** — key decisions/tradeoffs
   - **Testing** — validation performed
   - **References** — `Closes`/`Fixes #N`, ADR links (optional)
   - AI disclaimer via `acting-on-behalf`
4. Validate the title against § Title format, then mark ready for review:
   ```bash
   gh pr ready <number>
   ```

## Title format

Applies to every PR title created or updated by this skill (Phase 1 and
Phase 3), and mirrors the commit-subject policy in `AGENTS.md`.

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
  Use `!` only for intentionally breaking changes: with this repository's
  current release-please configuration and pre-1.0 package versions, it
  requests a `1.0.0` major release and therefore requires explicit human
  approval.
- Validate before creating, updating, or readying a PR title — whether
  through the built-in `create_pull_request`/`update_pull_request` tools
  or the `gh pr create`, `gh pr edit --title`, `gh pr ready` commands:
  `^(feat|fix|docs|refactor|test|chore|ci|perf|build|revert)(\([^()\s]+\))?!?:\s+\S.*`

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
gh pr view <number> --json reviews \
  --jq '[.reviews[] | select(.author.login | test("copilot"))]'
```

- Poll every 30s, timeout after 10 minutes.
- If findings: categorize by severity, feed actionable ones into
  `review-fix-loop`.
- If no findings or timeout: proceed.
- If repo doesn't use Copilot review: skip and note.

## Phase 6 — Address human review feedback

Poll for reviewer feedback:
```bash
gh pr view <number> --json reviews,comments
```

For each comment:
- **Actionable** → dispatch `implementer`, push fix, reply:
  `Fixed in <sha>` (via `acting-on-behalf`), resolve thread.
- **Question** → reply with evidence/rationale, leave thread open.
- **Disagreement** → reply with rebuttal + evidence, let reviewer decide.

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
| `create_pull_request` (built-in) | `gh pr create --draft --title "<type>: <description>" --body "<issue ref + placeholder>"` (non-interactive — never a bare `gh pr create --draft` with no `--body`, and never a `WIP:` placeholder); validate the title against § Title format first |
| `gh pr checks --watch` | `gh run watch <run-id>` |
| `stage-pr` | Report staging unavailable |

## Pre-requisites

- `acting-on-behalf` — required before any PR creation or comment.
- `review-fix-loop` — for gate iteration.
- `commit-message-storyteller` — for commit messages during fixes.
