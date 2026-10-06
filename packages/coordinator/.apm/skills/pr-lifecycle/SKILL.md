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

**Transport invariant:** Conventional title validation applies before every PR
create, update, or ready action. Runtime-native tools and `gh` use the same
regex and cannot bypass it.

## Trigger phrases

- "create a PR", "open a draft PR", "push this and open a PR"
- "address PR feedback", "respond to review comments", "iterate on a PR"
- "watch CI", "monitor checks", "let me know when it's green"
- "wait for Copilot review", "watch for code review"

---

## Entry routing

Select the current lifecycle state before entering a phase:

- If no PR exists and the user requested PR creation, enter Phase 1.
- If a PR already exists and the user just pushed, asks about CI/checks, or
  asks when it will be green, jump directly to Phase 4. Do not re-enter Phase
  1 or suggest `gh pr create`.
- If the user asks about review feedback, enter Phase 6.
- If the user asks to finalize an existing draft after gates pass, enter Phase
  3.

When the user asks for one concrete `gh pr create` command, the command must
contain `--draft`, a validated Conventional `--title`, and a non-empty `--body`
in that same command.

**Scope invariant:** a Conventional Commit scope is optional and permitted only
when it materially clarifies the affected package or area. It is never always
allowed and must be omitted by default.

## Phase 1 — Early draft PR

Only when no PR exists and the user explicitly requested PR creation:

1. Invoke `acting-on-behalf` immediately before creating the PR. It must
   determine credential provenance and any required final disclaimer. If it is
   unavailable or provenance remains unknown, stop before posting.
2. Open a **draft PR** with a Conventional
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
3. Skip for `research` flows, when the user did not request a PR, or when a PR
   already exists.

## Phase 2 — Implementation & gates

Work proceeds via `arielvalentin: implementer` when the companion
development-workflow package is installed, or directly through the current
orchestration owner otherwise, plus review gates (`review-fix-loop`).
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
   Never describe Phase 3 as converting or renaming the title into
   Conventional Commits format for the first time.
3. Rewrite body to include:
   - **Intent** — why the change exists
   - **Changes** — key decisions/tradeoffs
   - **Testing** — validation performed
   - **References** — `Closes`/`Fixes #N`, ADR links (optional)
   - conditional AI attribution via `acting-on-behalf`
   PR-body attribution is not part of feedback processing:
   `pr-feedback-review` never decides attribution. `acting-on-behalf` is the
   sole source of truth for whether a PR body needs AI attribution.
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
- Validate before any PR create, update, or ready action, including
  runtime-native PR tools and the `gh pr create`, `gh pr edit --title`, or
  `gh pr ready` commands:
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
- Dispatch `arielvalentin: implementer` with failure context when available;
  otherwise keep the bounded fix with the current orchestration owner
- Re-run affected gates, push fix, re-watch

**On success:** proceed to Phase 5.

**Fallback:** If `--watch` unavailable, use `gh run watch <run-id>`.

## Phase 5 — Wait for Copilot code review

After CI passes, check only whether a Copilot-shaped review candidate exists:

```bash
gh api --paginate "repos/{owner}/{repo}/pulls/{number}/reviews" \
  --jq '[.[] | select(((.user.login // "") | startswith("copilot-pull-request-reviewer"))) | {id, state, user: {login: .user.login, type: .user.type}, performed_via_github_app: .performed_via_github_app}]'
```

- This is candidate detection only. Do not classify the actor or chain, act on
  findings, draft or post a reply, resolve a thread, or start a fix loop in
  Phase 5.
- Poll every 30s, timeout after 10 minutes.
- Whether a candidate appears or the poll times out, proceed to Phase 6. A
  timeout or empty candidate list is not proof that no relevant feedback or
  replies exist.
- If repo doesn't use Copilot review: skip and note.

## Phase 6 — Process review feedback

Before any classification or action, retrieve PR review comments, reviews,
issue/PR comments, and GraphQL review threads using the exact `gh api` commands
in `human-interaction-safeguard`.
Do not classify actors from `gh pr view --json reviews,comments` or login text.
Exhaust both `reviewThreads` pages and every thread's independent `comments`
pages. Do not classify, implement, invoke `pr-feedback-review` or
`review-fix-loop`, draft or post a reply, or resolve a thread until complete
retrieval is verified. Incomplete, failed, or unverifiable retrieval makes the
relevant chain `HUMAN_STOP` before any action.

Only after complete retrieval, apply the thread/chain taint rule:
`AUTOMATION_FLOW` requires every root comment and reply to have authoritative
Bot metadata. Any User, unknown, missing, ambiguous, other, or unverified
participant makes the entire relevant chain `HUMAN_STOP`, so no comment in it
may trigger implementation, an agent reply, or agent resolution.
Any `HUMAN_STOP` item taints the entire chain.

Apply `human-interaction-safeguard` first. It is the sole source of truth for
actor classification and behavior:

- `HUMAN_STOP` → return control to the user; do not initiate a change from the
  interaction, draft or post a reply, or resolve the thread. A later, separate,
  explicit implementation instruction may authorize code/config/test work;
  reply and resolution remain user-only.
- `AUTOMATION_FLOW` → use `pr-feedback-review`; only its accepted actionable
  findings may then enter `review-fix-loop`.

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
| Runtime-native PR creation/update | Use `gh` with the same draft, title, body, attribution, and confirmation requirements |
| `gh pr checks --watch` | `gh run watch <run-id>` |
| `stage-pr` | Report staging unavailable |

## Pre-requisites

- `human-interaction-safeguard` — source of truth for actor behavior.
- `acting-on-behalf` — posting and attribution backstop.
- `pr-feedback-review` — bot/app feedback handling after actor classification.
- `review-fix-loop` — for gate iteration.
- `commit-message-storyteller` — for commit messages during fixes.
