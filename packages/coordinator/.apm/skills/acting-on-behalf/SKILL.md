---
name: acting-on-behalf
description: Use when posting comments/issues/PRs or other public content on behalf of the user.
---

# Acting on behalf of the user

Use this skill whenever you are about to post content to GitHub (or another
shared/public platform) on behalf of the user.

This skill is mandatory for PR/issue comment posts and replies.

## Identifying the user

Invoke the `resolve-github-user` skill to determine the current GitHub
username. Use the returned handle in disclaimers and attributions.

## Always enforce

1. Include an AI-generated disclaimer in every public/shared post.
2. Place the disclaimer either:
   - as the final non-empty paragraph/content in the post, with nothing after
     it; or
   - as a Markdown footnote referenced from the post, with the disclaimer's
     footnote definition as the final non-empty content.
   This placement rule applies to PR bodies, issue bodies, comments, review
   replies, release notes, and similar public/shared text.
3. For PR/issue comment posts and replies, invoke this skill before posting
   and keep the disclaimer in the final comment body.
4. For replies to PR feedback comments, include the related commit SHA in the
   comment text (for example: `Fixed in <sha>`) before the final disclaimer or
   disclaimer footnote definition.
5. Open PRs in draft mode by default (`gh pr create --draft`).
6. Tie PRs and non-trivial commits to an issue.
7. Use `gh` CLI for all GitHub operations.
8. PR descriptions must include intent and decision-making rationale:
   - why the change exists
   - key decisions/tradeoffs
   - direct issue references (`Closes`/`Fixes owner/repo#N`)
   - optional ADR references when relevant
9. For PRs containing code/config/script changes, run `adversarial-review`
   before PR creation and continue fix/re-review cycles until blocker/major
   feedback is satisfied. If the same blocker/major concern is raised twice and
   still unsatisfied, escalate to the user before proceeding. Skip only on
   explicit user request.

## PR/issue comment rule

Before posting or replying to a PR/issue comment:

1. Include the requested substantive message and the AI disclaimer in the
   comment body.
2. If the comment invokes a GitHub issue-ops slash command (for example,
   `/catalog-diff`), keep the slash command as the exact first line of the
   comment. Do not prefix the command with the disclaimer or any other text.
3. Place the disclaimer last, using one of the two allowed forms above. When
   other content follows a slash command, never place the disclaimer immediately
   after the command.
4. Verify the disclaimer remains last in the final text sent to GitHub.
5. For PR feedback replies, add the related commit SHA (`Fixed in <sha>`) before
   the final disclaimer or disclaimer footnote definition.

## If no issue is provided

1. Search for likely existing issues first:
   - `gh issue list --search "<keywords>"`
2. Confirm the candidate with the user before assuming.
3. If nothing matches, ask whether to open a new issue, then draft/create it
   before opening a PR.

## Posting templates (adapt wording by context)

Direct final paragraph:

> _🤖 This comment was drafted by an AI agent on behalf of @{username}._

Footnote:

```markdown
Substantive post content.[^ai]

[^ai]: 🤖 This post was drafted by an AI agent on behalf of @{username}.
```

Replace `{username}` with the authenticated GitHub handle at runtime.

## PR safety gate

Before calling `pr-lifecycle` Phase 3 / `gh pr create` for code changes:

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
2. `pr-lifecycle` missing -> the draft-by-default rule still applies. If no
   draft PR exists, create it non-interactively with one `gh pr create --draft`
   command, a real Conventional title substituted in (never emit `<type>` or
   `<description>` literally), and a non-empty body:
   The create command must include all three flags: `--draft`, `--title`, and
   `--body`. Never omit `--draft`.

   ```sh
   gh pr create --draft --title "fix: correct null handling in login handler" --body "Refs #123"
   ```

   Never a bare `--draft` with no `--body`, and never a `WIP:` title. The
   title must be `<type>[(<scope>)][!]: <description>`, where `<type>` is
   one of `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `perf`,
   `build`, `revert`; `(<scope>)` is optional and `!` marks a breaking
   change. Validate the title against
   `^(feat|fix|docs|refactor|test|chore|ci|perf|build|revert)(\([^()\s]+\))?!?:\s+\S.*`
   before creating, updating, or readying a PR title — whether through the
   built-in `create_pull_request`/`update_pull_request` tools or
   `gh pr create`, `gh pr edit --title`, `gh pr ready`. Also use
   `gh pr checks --watch`, `gh pr view|edit|comment|checks`, and
   `gh run view|watch`.
3. `stage-pr` missing -> report staging as unavailable and proceed without
   staging automation.
