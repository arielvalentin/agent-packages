---
name: acting-on-behalf
description: Use when posting comments/issues/PRs or other public content on behalf of the user.
---

# Acting on behalf of the user

Use this skill whenever you are about to post content to GitHub (or another
shared/public platform) on behalf of the user.

This skill is mandatory for PR/issue comment posts and replies.

## Identifying the user

Resolve the current GitHub username using the cheapest available source (in
priority order):

1. Session context or environment (e.g., `GITHUB_USER`, repo ownership)
2. Local git config: `git config user.name` or `git config user.email`
3. GitHub CLI cache: `gh auth status` (already authenticated, no API call)
4. API call (last resort): `gh api user --jq '.login'`

Use this handle in disclaimers and attributions.

## Always enforce

1. Include an AI-generated disclaimer in posted content.
2. For PR/issue comment posts and replies, invoke this skill before posting
   and keep the disclaimer in the final comment body.
3. For replies to PR feedback comments, include the related commit SHA in the
   comment text (for example: `Fixed in <sha>`).
4. Open PRs in draft mode by default (`gh pr create --draft`).
5. Tie PRs and non-trivial commits to an issue.
6. Use `gh` CLI for all GitHub operations.
7. PR descriptions must include intent and decision-making rationale:
   - why the change exists
   - key decisions/tradeoffs
   - direct issue references (`Closes`/`Fixes owner/repo#N`)
   - optional ADR references when relevant
8. For PRs containing code/config/script changes, run `adversarial-review`
   before PR creation and continue fix/re-review cycles until blocker/major
   feedback is satisfied. If the same blocker/major concern is raised twice and
   still unsatisfied, escalate to the user before proceeding. Skip only on
   explicit user request.

## PR/issue comment rule

Before posting or replying to a PR/issue comment:

1. Include the AI disclaimer line in the comment body.
2. Verify the disclaimer remains in the final text sent to GitHub.
3. For PR feedback replies, add the related commit SHA (`Fixed in <sha>`).

## If no issue is provided

1. Search for likely existing issues first:
   - `gh issue list --search "<keywords>"`
2. Confirm the candidate with the user before assuming.
3. If nothing matches, ask whether to open a new issue, then draft/create it
   before opening a PR.

## Posting template (adapt wording by context)

> _🤖 This comment was drafted by an AI agent on behalf of @{username}._

Replace `{username}` with the authenticated GitHub handle at runtime.

## PR safety gate

Before calling `create-pr`/`gh pr create` for code changes:

1. Run `adversarial-review`.
2. Address high-confidence blocker/major findings.
3. Re-run `adversarial-review` after fixes and repeat until blocker/major
   findings are satisfied.
4. If the same blocker/major concern is raised twice and still unsatisfied,
   stop and escalate to the user with unresolved items.
5. Keep changes scoped to the original request/task list; avoid unrelated edits.
6. Validate final results against the original request/task list before PR
   creation.
7. If the user explicitly says to skip adversarial review, proceed and note the
   explicit waiver in the PR body or handoff summary.

## PR description content checklist

Before opening a PR, ensure the description includes:

1. Intent: what problem/outcome this PR addresses.
2. Decision process: key choices and tradeoffs made.
3. Direct issue references using closing syntax (`Closes`/`Fixes`).
4. ADR references when an ADR informed the decision (optional).

## PR evidence requirement for policy/config refactors

For changes that modify agent policy/config behavior, include a compact
"Evidence" section in the PR body with:

- before/after size metrics
- preserved guardrail proof
- extracted section mapping
- validation/consensus summary

## Skill-availability fallbacks

If companion skills are unavailable, do not block progress. Use:

1. `adversarial-review` missing -> run a hostile `rubber-duck` consensus review
   and keep blocker/major fix loops before PR creation.
2. `create-pr` missing -> use `gh pr create --draft`.
3. `manage-pr` missing -> use `gh pr view|edit|comment|checks` and
   `gh run view|watch`.
4. `watch-ci` missing -> use `gh pr checks --watch` (or `gh run watch`).
5. `stage-pr` missing -> report staging as unavailable and proceed without
   staging automation.
