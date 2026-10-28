---
name: acting-on-behalf
description: Use before posting comments/issues/PRs or other public/shared content.
---

# Acting on behalf of the user

Use this skill whenever you are about to post content to GitHub (or another
shared/public platform). It decides whether user attribution requires a
disclaimer.

This skill is mandatory for PR/issue comment posts and replies.

Repository guidance owns project conventions such as title/commit format,
tracking, templates, validation, and release process. The conventions below
are defaults when the repository is silent, not new repository requirements.
An issue is required only when repository guidance requires one; never invent
a tracking gate or reference. Repository conventions do not waive permission,
human-interaction, attribution, or mandatory review gates.

## Human-interaction posting backstop

Before drafting, posting, replying to, or resolving an existing public GitHub
interaction, invoke `human-interaction-safeguard`.

- This includes every comment or review on an existing public PR or issue,
  even a new top-level comment. Retrieve and classify the complete relevant
  conversation chain before drafting or posting.
- `HUMAN_STOP` prohibits an agent-authored reply and agent-performed thread
  resolution by default. Only `human-interaction-safeguard` can authorize its
  single-action exception through ordinary scoped user confirmation.
  Defer the warning and confirmation UX to that skill.
  Classification stays `HUMAN_STOP`; continue all
  posting, identity, attribution, and independent approval rules below.
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
of." A display-name byline without a username still requires the disclaimer:
**Yes** for a bot/service post saying `Prepared by Ariel Valentin`, even with
its own credentials and no username shown. Likewise, `on behalf of @octocat`
requires the disclaimer.

If credential/account provenance cannot be determined confidently, do not
silently treat the post as an unattributed service post. Pause and ask the user
which identity will publish it before posting.

## Identifying the user

Invoke `resolve-github-user` only when the substantive post needs the user's
identity for explicit attribution. Do not look up a username, model, or
provider solely to render the disclaimer.

## Always enforce

1. Apply the Disclaimer decision above; do not duplicate or override that
   decision in individual workflows. The disclaimer contains no username,
   model, or provider.
2. When a disclaimer is required, preserve the supplied substantive body, then
   append a blank line and the exact footer below as the final paragraph of
   the agent-composed body. This applies to PR bodies, issue bodies, comments,
   review replies, release notes, and similar public/shared text.
   Tool-added notices do not change this rule and should be left untouched.
3. For permitted replies to bot/app PR feedback, include the related commit SHA
   in the comment text (for example: `Fixed in <sha>`) before the disclaimer
   when one is required.
4. Open PRs in draft mode by default (`gh pr create --draft`).
5. Follow repository tracking requirements; preserve relevant issue references.
   If required tracking is unavailable, surface the gate rather than inventing
   an issue or bypassing it. Document unavailable issue tracking in the PR body
   only when repository guidance requires that context.
6. Use `gh` CLI for all GitHub operations.
7. Apply `writing-voice` and its artifact-authoring reference to PR descriptions.
   Keep required tracking context:
   - relevant direct issue references (`Closes`/`Fixes owner/repo#N`), required
     tracking, or the documented absence of issue tracking when repository
     guidance requires it
   - optional ADR references when relevant
8. Apply the PR safety gate below before creating or finalizing code/config/script
   PRs; draft status does not waive it.

## PR/issue comment rule

Apply the posting backstop and disclosure decision before composing a permitted
comment. For GitHub issue-ops commands such as `/catalog-diff`, keep the slash
command as the exact first line of the comment. The requested substantive
content follows; any required disclaimer is the final paragraph. Do not insert
the disclaimer immediately after the command when other content follows.
For a permitted PR feedback reply, put `Fixed in <sha>` before the disclaimer.

## If no issue is provided

1. If repository guidance requires an issue, search for likely existing issues
   first when Issues are available:
   - `gh issue list --search "<keywords>"`
2. Confirm the candidate with the user before assuming.
3. If nothing matches, ask whether to open a new issue; never create one without
   authorization. Required tracking blocks publication until resolved.
4. If Issues are disabled, use the repository's supported tracking mechanism.
   If none exists and none is required, proceed without tracking boilerplate.
5. If the repository does not require an issue, do not add that requirement.

## Posting template

Use this exact final paragraph when a disclaimer is required:

> _AI Assisted._

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

## Authoring permitted content

After the interaction gate permits drafting, load `writing-voice`; it owns
voice, evidence, rationale, structure and validation detail. Apply its final
reader check immediately before every permitted post, including new PR and
issue bodies. For PR descriptions also load its artifact-authoring reference
and preserve the tracking context listed above. These are content requirements,
not mandatory section headings. Writing guidance grants no posting permission.

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
   `gh pr create`, `gh pr edit --title`, `gh pr ready`. Monitoring follows
   `pr-lifecycle` Phase 4 when available; otherwise read exact-head check status
   once and report pending/failure, never invent a controller or assume success.
3. `stage-pr` missing -> report staging as unavailable and proceed without
   staging automation.
