---
name: acting-on-behalf
description: Use before posting comments/issues/PRs or other public/shared content.
---

# Acting on behalf of the user

Use this skill whenever you are about to post content to GitHub (or another
shared/public platform). It decides whether user attribution requires a
disclaimer.

This skill is mandatory for PR/issue comment posts and replies.

## Human-interaction posting backstop

Before drafting, posting, replying to, or resolving an existing public GitHub
interaction, invoke `human-interaction-safeguard`.

- `HUMAN_STOP` unconditionally prohibits an agent-authored reply and
  agent-performed thread resolution. The user writes the reply and controls
  resolution.
- `AUTOMATION_FLOW` may continue through the posting rules below.
- If the safeguard skill is unavailable, fail closed as `HUMAN_STOP`.

## Disclaimer decision

A disclaimer is required when either condition is true:

`uses_personal_credentials OR explicitly_attributes_user`

- Personal credentials/token or the user's account: **Yes**.
- Bot, app, or service credentials plus explicit user attribution: **Yes**.
- Bot, app, or service credentials with no user attribution: **No**.
- Unknown credential/account provenance: **Pause and ask before posting**.

Never infer **No** from service credentials alone. Explicit user attribution
overrides the service identity. Attribution includes the user's username or
handle, display or real name, a byline, or wording such as "by" or "on behalf
of." For example, a bot comment with `Prepared by Ariel Valentin` or `on behalf
of @octocat` requires the disclaimer.

If credential/account provenance cannot be determined confidently, do not
silently treat the post as an unattributed service post. Pause and ask the user
which identity will publish it before posting.

## Identifying the user

Invoke `resolve-github-user` only when the substantive post needs the user's
identity for explicit attribution. Do not look up a username, model, or
provider solely to render the disclaimer.

## Always enforce

1. Include the short AI-assistance disclaimer only when either condition is
   true:
   - the agent posts using the user's personal credentials or token, including
     when the platform shows the post under the user's account; or
   - the post explicitly attributes the user through a username/handle,
     display or real name, byline, or "by"/"on behalf of" wording.
2. Do not add a disclaimer when a bot, app, or service identity posts without
   attributing the user. Apply this only when the posting identity is known.
3. Do not include a username, model, or provider in the disclaimer.
4. When a disclaimer is required, preserve the supplied substantive body, then
   append a blank line and the exact footer below as the final paragraph of
   the agent-composed body. This applies to PR bodies, issue bodies, comments,
   review replies, release notes, and similar public/shared text.
   Tool-added notices do not change this rule and should be left untouched.
5. For permitted replies to bot/app PR feedback, include the related commit SHA
   in the comment text (for example: `Fixed in <sha>`) before the disclaimer
   when one is required.
6. Open PRs in draft mode by default (`gh pr create --draft`).
7. Tie PRs and non-trivial commits to an issue when the repository supports
   Issues. If Issues are disabled, use the repository's supported tracking
   mechanism or document its absence in the PR body.
8. Use the runtime-mandated native GitHub operation when one is required;
   otherwise prefer `gh` CLI. Apply the same attribution, confirmation,
   draft, title, body, and human-interaction safeguards across transports.
9. PR descriptions must include intent and decision-making rationale:
   - why the change exists
   - key decisions/tradeoffs
   - direct issue references (`Closes`/`Fixes owner/repo#N`) when supported,
     or the documented absence of issue tracking
   - optional ADR references when relevant
10. For PRs containing high-risk code/config/script changes, or when the user
    requests hostile critique, run `adversarial-review` before PR creation.
    Routine changes rely on targeted validation and at most one optional review
    gate. Security-sensitive changes still require `security-review`.
    If mandatory `security-review` is unavailable, stop before PR creation or
    posting and report the unavailable safeguard.

## PR/issue comment rule

Before posting or replying to a PR/issue comment:

1. Apply `human-interaction-safeguard` when the action responds to an existing
   interaction. Never draft, post, or resolve on `HUMAN_STOP`.
2. Include the requested substantive message and determine whether the post
   meets a disclaimer condition.
   If the posting identity is unknown, pause and ask before posting.
3. If the comment invokes a GitHub issue-ops slash command (for example,
   `/catalog-diff`), keep the slash command as the exact first line of the
   comment. Do not prefix the command with the disclaimer or any other text.
4. If a disclaimer is required, append it as the final paragraph of the
   supplied body. When other content follows a slash command, never place the
   disclaimer immediately after the command.
5. Verify any required disclaimer remains last in the agent-composed body.
   Do not add one for an unattributed bot, app, or service post.
6. For a permitted PR feedback reply, add the related commit SHA
   (`Fixed in <sha>`) before the final disclaimer when required.

## If no issue is provided

1. When the repository supports Issues, search for likely existing issues
   first:
   - `gh issue list --search "<keywords>"`
2. Confirm the candidate with the user before assuming.
3. If nothing matches, ask whether to open a new issue, then draft/create it
   before opening a PR.
4. If Issues are disabled, use the repository's supported tracking mechanism.
   If none exists, document that in the PR body and proceed.

## Posting template

Use this exact final paragraph when a disclaimer is required:

> _AI Assisted._

## Conditional PR safety gate

Before calling `pr-lifecycle` Phase 3 / `gh pr create` for high-risk code
changes or an explicit adversarial-review request:

1. Run `adversarial-review` through `review-fix-loop` with
   `max_retries: 2`, `severity_threshold: blocker,major`, and
   `on_exhaust: escalate`.
2. Stop after two total fix/re-review cycles, even when each cycle reports a
   different finding. Do not create a new review wave to extend the budget.
3. If blocker/major findings remain, stop and escalate to the user.
4. Keep changes scoped to the original request/task list; avoid unrelated edits.
5. Validate final results against the original request/task list before PR
   creation.
6. If the user explicitly says to skip a non-mandatory adversarial review,
   proceed and note the waiver in the PR body or handoff summary. Do not treat
   this as a waiver of mandatory security review or posting safeguards.

## PR description content checklist

Before opening a PR, ensure the description includes:

1. Intent: what problem/outcome this PR addresses.
2. Decision process: key choices and tradeoffs made.
3. Direct issue references using closing syntax (`Closes`/`Fixes`) when the
   repository supports Issues; otherwise document the tracking alternative or
   absence of issue tracking.
4. ADR references when an ADR informed the decision (optional).

## PR evidence requirement for policy/config refactors

For changes that modify agent policy/config behavior, include a compact
"Evidence" section in the PR body with:

- before/after size metrics
- preserved guardrail proof
- extracted section mapping
- validation/consensus summary

## Skill-availability fallbacks

If companion skills are unavailable, do not block routine progress. Mandatory
security and posting safeguards still fail closed. Use:

1. `adversarial-review` missing during a mandatory high-risk or explicitly
   requested hostile review -> stop before completion, PR creation, or posting.
   Do not substitute another reviewer or report success. For an optional
   routine adversarial review only, report reduced assurance and use one
   bounded `rubber-duck` review.
2. `security-review` missing when the review is mandatory -> stop before PR
   creation or posting. Do not substitute another reviewer or report success.
3. `pr-lifecycle` missing -> the draft-by-default rule still applies. If no
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
   before any PR create, update, or ready action, including runtime-native PR
   tools and `gh pr create`, `gh pr edit --title`, or `gh pr ready`. For CLI
   monitoring, use `gh pr checks --watch`, `gh pr view|edit|comment|checks`,
   and `gh run view|watch`.
4. `stage-pr` missing -> report staging as unavailable and proceed without
   staging automation.
