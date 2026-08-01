---
name: pr-lifecycle
description: >
  End-to-end PR management: early WIP draft, description requirements,
  skill triggers, CI/review monitoring loop, and post-merge cleanup.
  Reusable by any agent that creates or manages pull requests.
---

# PR Lifecycle

Covers every phase of a pull request from creation through merge and cleanup.
Any agent that touches PRs should follow these rules.

## Early WIP draft PR

For `feature`, `bugfix`, and `refactor` flows targeting a production codebase:

1. As soon as a branch exists (even before implementation begins), open an
   **empty WIP draft PR** with `gh pr create --draft --title "WIP: <goal>"`.
2. The PR body should contain:
   - The goal / issue reference
   - A note that implementation is in progress
   - Placeholder sections for intent, decisions, and references (to be
     filled later)
3. This makes the work visible to the team immediately and enables early CI
   feedback on the branch.

Skip for `research` flows or when the user explicitly says not to open a PR.

## Finalizing the PR

When implementation is complete and all gates pass:

1. Rename the title to Conventional Commits format:
   `<type>(<scope>): <description>`
2. Check for a PR template (`.github/PULL_REQUEST_TEMPLATE.md` or
   `.github/PULL_REQUEST_TEMPLATE/` directory) and follow its structure.
3. Rewrite the body to reflect the **final state** of the changes — not
   interim WIP notes or earlier iterations.
4. Include: intent, key decisions/tradeoffs, issue references, and test
   evidence.
5. Remove any WIP placeholders or draft notes.

## PR description requirements

Every PR description must include:

1. **Intent** — why the change exists / problem being solved.
2. **Decision-making rationale** — key choices and tradeoffs.
3. **Issue references** — direct closing syntax (`Closes`/`Fixes`).
4. **ADR references** — when decisions were guided by ADRs (optional).

## Skill triggers

Use PR skills explicitly based on intent:

| Scenario | Skills | Sequence |
|----------|--------|----------|
| New PR creation | `acting-on-behalf` → `create-pr` → `watch-ci` | After PR readiness gate passes |
| Existing PR iteration | `acting-on-behalf` → `manage-pr` → `watch-ci` | After updates pushed |
| PR/issue comment | `acting-on-behalf` | Before drafting/posting; include AI disclaimer |
| PR feedback reply | `acting-on-behalf` | Include related commit SHA (`Fixed in <sha>`) |
| Preview/staging | `stage-pr` | On request |

Do not skip these skills for these flows.

### Skill fallbacks

| Missing skill | Fallback |
|--------------|----------|
| `create-pr` | `gh pr create --draft` with required body sections |
| `manage-pr` | `gh pr view\|edit\|comment\|checks` and `gh run view\|watch` |
| `watch-ci` | `gh pr checks --watch`, falling back to `gh run watch` |
| `stage-pr` | Report staging as unavailable, continue without |

## CI/review monitoring loop

After the PR is finalized, monitor and iterate until merged or closed:

### 1. Watch CI

Run `watch-ci` (or `wait-for-copilot-code-review` if Copilot review is
expected) to monitor checks. If CI fails:

- Analyze the failure (test errors, lint, build)
- Dispatch `implementer` with the failure context
- Re-run affected gates via `review-fix-loop`
- Push fixes and re-watch CI

### 2. Monitor reviews

Poll for reviewer feedback via `gh pr view --json reviews,comments`.
When feedback arrives:

- Run `pr-feedback-review` skill to analyze each comment
- For valid concerns: dispatch `implementer`, push fix, reply with
  `Fixed in <sha>` and resolve the thread
- For rebuttals: reply with evidence/documentation and leave open for
  the reviewer
- Re-run `watch-ci` after any push

### 3. Loop exit conditions

| Condition | Action |
|-----------|--------|
| CI green AND all review threads resolved | Notify user PR is ready to merge |
| PR is merged | Proceed to post-completion cleanup |
| PR is closed | Notify user and stop |
| User says to stop monitoring | Stop |
| **Iteration limit reached (10)** | Stop, notify user with unresolved CI failures and open review threads |

### 4. Yield between iterations

Between iterations, yield control to the user. Resume when notified of
new CI results or review comments.

## Post-completion cleanup

After the PR is **merged** (not just finalized):

1. Use `list_sessions_and_chats` to find sessions tied to the merged PR.
2. Call `archive_session` on those sessions to clean up worktrees while
   preserving session history for future reference.
