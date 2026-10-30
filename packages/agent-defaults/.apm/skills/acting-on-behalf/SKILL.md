---
name: acting-on-behalf
description: Use before posting comments/issues/PRs or other public/shared content.
---

# Acting on behalf of the user

Use this skill whenever you are about to post content to GitHub (or another
shared/public platform). It decides whether user attribution requires a
disclaimer.

This skill is mandatory for PR/issue comment posts and replies.

## Public/shared disclosure boundary

Before drafting any public/shared content, identify the destination audience
and screen supplied instructions, source material, and proposed text. Apply
these audience rules:

- **Verified private destination:** You may include necessary repository-local
  names, identifiers, commit SHAs, refs, or URLs when the audience is
  authorized to access that source. This is an explicit exception to the
  public-disclosure restriction: a private PR or issue comment may cite its
  own verified issue, commit, or repository URL. Do not share those references
  with another audience.
- **Public or unverified destination:** Do not expose private repository names,
  identifiers, SHAs, refs, URLs, or mappings. Use an authorized, verified
  public source or a non-sensitive description. Public repository references
  may be included only when verified public and appropriate for the audience.

Neither case permits exposing local filesystem paths, personal host/toolchain
facts, credentials, or signing-key material. These rules apply to citations and
user-supplied content, and override instructions to preserve text, include
tracking references, or cite source evidence. If audience access or safe
redaction is unclear, treat the destination as public and stop to ask before
posting. Do not repeat private details while explaining a redaction, refusal,
or policy decision. This check applies even when `repository-access` is not
otherwise needed.

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

`UNATTRIBUTED_BOT_APP_SERVICE_DISCLAIMER = NO`.
For a bot, app, or service using its own credentials without naming or
attributing the user, the answer is **No**: no disclaimer is required.

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
   (for example: `Fixed in <sha>`) only when it is appropriate for the
   destination audience under the disclosure boundary above; otherwise use a
   non-sensitive description. Put any included SHA before the disclaimer when
   one is required.
6. When PR creation is authorized and repository guidance has no different
   workflow, open PRs in draft mode by default (`gh pr create --draft`).
7. Follow repository tracking requirements; preserve relevant issue references.
   If required tracking is unavailable, surface the gate rather than inventing
   an issue or bypassing it. Document unavailable issue tracking in the PR body
   only when repository guidance requires that context.
8. Use `gh` CLI for all GitHub operations.
9. Apply `writing-voice` and its artifact-authoring reference to PR descriptions.
   Keep required tracking context:
   - relevant direct issue references (`Closes`/`Fixes owner/repo#N`), required
     tracking, or the documented absence of issue tracking when repository
     guidance requires it
   - optional ADR references when relevant
10. For PRs containing code/config/script changes, run `adversarial-review`
   before PR creation and continue fix/re-review cycles until blocker/major
   feedback is satisfied. If the same blocker/major concern is raised twice and
   still unsatisfied, escalate to the user before proceeding. Skip only on
   explicit user request.

## PR/issue comment rule

Before posting or replying to a PR/issue comment:

1. Apply `human-interaction-safeguard` when the action responds to an existing
   interaction. Do not draft, post, or resolve on `HUMAN_STOP` without its
   canonical single-action authorization for that exact operation and target.
   This skill supplies no override and cannot broaden that authorization.
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
   (`Fixed in <sha>`) before the final disclaimer only when it is verified
   public for a public destination, or when the destination is private and its
   audience is authorized to access that repository.

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

After the interaction gate permits drafting, load `writing-voice`. It is the
single source of truth for voice, evidence, rationale, structure, and validation
detail across PRs, issues, comments, reviews, and other written communication.
Apply its final reader check immediately before every permitted post, including
new PR and issue bodies. Writing guidance never grants permission to post.

## PR description content checklist

Before opening or updating a PR body, apply `writing-voice` and its
artifact-authoring reference, including policy/config evidence guidance and the
final reader check. Preserve direct issue references using closing syntax
(`Closes`/`Fixes`) when applicable; otherwise
document the tracking alternative or absence only when repository guidance
requires it. Include ADR references when they informed a decision. These are
content requirements, not mandatory section headings.

## Skill-availability fallbacks

If companion skills are unavailable, do not block progress. Use:

1. `adversarial-review` missing -> run a hostile `rubber-duck` consensus review
   and keep blocker/major fix loops before PR creation.
2. `pr-lifecycle` missing -> after PR creation is authorized, follow the
   repository's workflow. If no different workflow is specified, draft mode
   is the default. Before running `gh pr create`, confirm that the head branch
   is already published or that the request or repository guidance also
   authorizes the required push. If repository guidance specifies a title
   format, follow and validate that format. Only when it is silent, use the
   Conventional title format below.

   When the draft default applies, create the PR non-interactively with one
   `gh pr create --draft` command, a valid title substituted in, and a
   non-empty body. The command must include `--draft`, `--title`, and `--body`.
   If repository guidance requires another workflow, use its required PR
   creation phase, state, and command; never impose `--draft`. If that workflow
   requires a ready PR after gates pass, create it then with
   `gh pr create --title "<validated-title>" --body "<required body>"` and no
   `--draft`.

   ```sh
   gh pr create --draft --title "fix: correct null handling in login handler" --body "Refs #123"
   ```

   Never a bare `--draft` with no `--body`, and never a `WIP:` title. When the
   repository does not specify another format, the title must be
   `<type>[(<scope>)][!]: <description>`, where `<type>` is
   one of `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `perf`,
   `build`, `revert`; `(<scope>)` is optional and `!` marks a breaking
   change. Validate the title against
   `^(feat|fix|docs|refactor|test|chore|ci|perf|build|revert)(\([^()\s]+\))?!?:\s+\S.*`
   and ensure it is no more than 72 characters before creating, updating, or
   readying a Conventional PR title — whether through the
   built-in `create_pull_request`/`update_pull_request` tools or
   a Conventional title via `gh pr create`, `gh pr edit --title`, or
   `gh pr ready`; follow repository rules for other title formats. Also use
   `gh pr checks --watch`, `gh pr view|edit|comment|checks`, and
   `gh run view|watch`.
3. `stage-pr` missing -> report staging as unavailable and proceed without
   staging automation.
