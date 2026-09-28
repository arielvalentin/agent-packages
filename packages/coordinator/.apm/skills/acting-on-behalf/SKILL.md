---
name: acting-on-behalf
description: Use before posting comments/issues/PRs or other public/shared content.
---

# Acting on behalf of the user

Use this skill whenever you are about to post content to GitHub (or another
shared/public platform). It decides whether AI disclosure is required and
whether to add a custom fallback.

This skill is mandatory for PR/issue comment posts and replies.

## Human-interaction posting backstop

Before drafting, posting, replying to, or resolving an existing public GitHub
interaction, invoke `human-interaction-safeguard`.

- `HUMAN_STOP` unconditionally prohibits an agent-authored reply and
  agent-performed thread resolution. The user writes the reply and controls
  resolution.
- `AUTOMATION_FLOW` may continue through the posting rules below.
- If the safeguard skill is unavailable, fail closed as `HUMAN_STOP`.

## Response mode

- For policy-only questions that request no post body, honor the requested
  answer form (such as Yes/No/Last). Do not render or append a footer.
- Requests for actual post, footer, or template text are composition requests,
  even when phrased as questions. Complete the posting decisions below before
  composing.

For custom-format checks, compare exact Markdown source, not just meaning.
Extra username, model, or provider text is invalid.

## Disclosure decision

AI disclosure is required when either condition is true:

`uses_personal_credentials OR explicitly_attributes_user`

- Personal credentials/token or the user's account: **Yes**.
- Bot, app, or service credentials plus explicit user attribution: **Yes**.
- Bot, app, or service credentials with no user attribution: **No**.
- Unknown credential/account provenance: **Pause and ask before posting**.

**Yes** requires AI disclosure; a sufficient verified built-in note can satisfy
it.

Publishing provenance is the account/token actually used, not the host, CLI
process, tool name, or footer. Establish whether that publisher is personal or
bot/app/service independently from disclosure evidence.

With known bot, app, or service credentials, check attribution before deciding:
no user attribution means **No**; explicit user attribution means **Yes**.
Attribution includes the user's username or handle, display or real name, a
byline, or wording such as "by" or "on behalf of." For example, a bot comment
with `Prepared by Ariel Valentin` or `on behalf of @octocat` requires AI
disclosure.

If credential/account provenance cannot be determined confidently, do not
silently treat the post as an unattributed service post. Pause and ask the user
which identity will publish it before posting.
Even with verified built-in AI disclosure, unknown credential/account
provenance still requires pausing and asking before posting.

## Posting-path evidence

The posting path is the actual mechanism/provider, not a host or shell label.
Verify sufficient built-in AI disclosure for the actual posting path in the
current client/configuration using reliable tool/runtime documentation or
observed output. Adequate text identifies AI assistance/authorship or a known AI
assistant. Generic posting/transport attribution and automation alone are not
AI disclosure. A username or byline alone is not AI disclosure.

Evidence for one route does not establish another. A tool name alone is not a
guarantee across clients/configurations. A CLI agent inside the Copilot App may
use the same App-managed posting mechanism; check the actual invocation rather
than inferring disclosure from the host.

Verified example: [this App-managed reply](https://github.com/arielvalentin/agent-packages/pull/46#discussion_r4124650579)
was published under the user's personal account (REST `user.type=User`).
The `reply_and_resolve_review_thread` mechanism appended the
`Auto-replied by the GitHub Copilot app.` note after the supplied body.
This verifies that mechanism's disclosure, not an App publishing identity or
every use of the tool name.

## Identifying the user

Invoke `resolve-github-user` only when the substantive post separately needs
the user's identity for explicit attribution. Do not resolve a username or
look up model/provider metadata solely to compose the disclaimer.

## Always enforce

1. Require AI disclosure when either condition is true:
   - the agent posts using the user's personal credentials or token, including
     when the platform shows the post under the user's account; or
   - the post explicitly attributes the user through a username/handle,
     display or real name, byline, or "by"/"on behalf of" wording.
2. Prefer verified built-in AI disclosure from the actual posting path. Do not
   add a custom disclaimer when that path supplies sufficient disclosure.
   If built-in AI disclosure is absent, insufficient, or unverified, use the
   custom fallback when disclosure is required. Unstated or uncertain
   availability is unverified. For a known bot, app, or service identity without
   user attribution, add no custom disclaimer. Leave any built-in disclosure
   alone.
3. After the safety, credential/attribution, and route decisions, include any
   required custom fallback when composing public content. No separate request
   for a footer is needed. Returning only the body does not waive required
   disclosure.
4. Place the custom fallback either:
   - as the final non-empty paragraph/content in the post, with nothing after
     it; or
   - as a Markdown footnote referenced from the post, with the fallback's
     footnote definition as the final non-empty content.
   This placement rule applies only to the custom fallback in the supplied
   body, not to tool-managed text. It covers PR bodies, issue bodies, comments,
   review replies, release notes, and similar public/shared text.
   Do not move, rewrite, or duplicate a tool-managed footer.
5. For permitted replies to bot/app PR feedback, include the related commit SHA
   in the comment text (for example: `Fixed in <sha>`) with built-in disclosure,
   a custom fallback, or no disclaimer. Place the SHA before the custom fallback
   when one is used.
6. Open PRs in draft mode by default (`gh pr create --draft`).
7. Tie PRs and non-trivial commits to an issue when the repository supports
   Issues. If Issues are disabled, use the repository's supported tracking
   mechanism or document its absence in the PR body.
8. Use `gh` CLI for all GitHub operations.
9. PR descriptions must include intent and decision-making rationale:
   - why the change exists
   - key decisions/tradeoffs
   - direct issue references (`Closes`/`Fixes owner/repo#N`) when supported,
     or the documented absence of issue tracking
   - optional ADR references when relevant
10. For PRs containing code/config/script changes, run `adversarial-review`
   before PR creation and continue fix/re-review cycles until blocker/major
   feedback is satisfied. If the same blocker/major concern is raised twice and
   still unsatisfied, escalate to the user before proceeding. Skip only on
   explicit user request.

## PR/issue comment rule

Before posting or replying to a PR/issue comment:

1. Apply `human-interaction-safeguard` when the action responds to an existing
   interaction. Never draft, post, or resolve on `HUMAN_STOP`.
2. Include the requested substantive message and determine whether the post
   meets an AI disclosure condition.
   If the posting identity is unknown, pause and ask before posting.
3. If the comment invokes a GitHub issue-ops slash command (for example,
   `/catalog-diff`), keep the slash command as the exact first line of the
   comment. Do not prefix the command with the disclaimer or any other text.
4. Apply the built-in-first rule for this exact posting path. If a custom
   fallback is needed, place it last using one of the two allowed forms above.
   When other content follows a slash command, never place the fallback
   immediately after the command.
5. Verify any custom fallback remains last in the supplied body. Do not add one
   for a known unattributed bot, app, or service post. Leave tool-managed
   disclosure alone.
6. For a permitted PR feedback reply, add the related commit SHA
   (`Fixed in <sha>`) even with built-in disclosure or no disclaimer. Place it
   before the final custom fallback or fallback footnote definition when present.

## If no issue is provided

1. When the repository supports Issues, search for likely existing issues
   first:
   - `gh issue list --search "<keywords>"`
2. Confirm the candidate with the user before assuming.
3. If nothing matches, ask whether to open a new issue, then draft/create it
   before opening a PR.
4. If Issues are disabled, use the repository's supported tracking mechanism.
   If none exists, document that in the PR body and proceed.

## Custom fallback templates

Use these templates only when the custom fallback is needed.
Only for actual fallback composition after those decisions, copy the direct
footer exactly: `> _AI-assisted._`.
Preserve the `>` marker, both underscores, and the period. The referenced
footnote below is the only alternative. Include no username, model, or provider.
Use the direct final paragraph by default. Copy the raw Markdown inside the
fence, without the fence itself:

```markdown
> _AI-assisted._
```

Use the footnote only when the surrounding content benefits from a reference:

```markdown
Substantive post content.[^ai]

[^ai]: AI-assisted.
```

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
