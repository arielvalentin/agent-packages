---
name: acting-on-behalf
description: Use before posting comments/issues/PRs or other public/shared content.
---

# Acting on behalf of the user

Mandatory before public/shared posts, including PR/issue comments and replies.
This skill owns audience screening, disclosure, and attribution.

A request for no outer command quotes does not remove argument quoting.

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

For unanswered or unavailable confirmation, follow
`human-interaction-safeguard`'s **Unattended decision handling**, including
posting identity and disclosure blockers. This does not waive any posting gate.

## GitHub tool routing

Use local `git` for local repository state. For remote GitHub operations, use
the exposed GitHub MCP tool that supports the exact operation. Check the
session's tool inventory and declared capabilities before using `gh` for a
specific operation that no exposed MCP tool can perform. This includes reads:
check support for the target host, required fields, and complete pagination.
Honor any platform-required native tool that can bind the exact target and
operation.
A failed call, incomplete result from a tool that supports the read, timeout,
rate limit, authentication error, or denied approval is not a tool gap.
Handle the failure under the applicable gate; do not switch to `gh`.

Bind the exact host, repository, and applicable item number or SHA on every
operation. Where a verified tool gap calls for `gh`, pass an explicit
host-qualified target. When a snapshot requires distinct operations, check
capabilities for each, keep the target and identity consistent, and verify
the complete snapshot as required by its gate. Never splice in data from
another route to complete a failed or partial read.

Before creating a PR, verify that the intended base ref exists on the bound
host and repository and that the authorized head repo and ref are published.
Confirm immediately before creation that the remote head SHA is the reviewed
head SHA and the published diff matches local acceptance. Bind both refs
explicitly; never infer the base from a default or local branch configuration.
A needed push requires its own authorization. Verify the new PR's head SHA
and both refs before proceeding. Before any write to an existing PR, verify
its live base matches the bound base. Compare the live head SHA and base SHA
with the snapshots used for the relevant authorization, review, and write
gates. On any mismatch, stop and reapply the affected gates before acting.
A mismatch is not permission to retarget the PR.

Before any write, confirm the authenticated account and apply the identity,
authorization, and disclaimer rules to it. When a write has an unknown
outcome, verify its state. Retry a non-repeatable write only after confirming
it did not apply and cannot still apply; otherwise stop and report it.
Never post twice. A `HUMAN_STOP` single-reply confirmation is
consumed by the first attempted reply, even if it fails without posting.
Any retry requires fresh single-reply confirmation under
`human-interaction-safeguard`; confirmed non-delivery does not restore approval.
The route never changes posting permission, attribution, disclosure, or review
gates.

## Human-interaction posting backstop

Before drafting, posting, replying to, or resolving an existing public GitHub
interaction, invoke `human-interaction-safeguard`, including for new top-level
comments or reviews on existing public PRs/issues. It owns complete-chain
retrieval, classification, warnings, and single-reply confirmation.
If unavailable, fail closed as `HUMAN_STOP`.

`HUMAN_STOP` blocks drafting, replies, and resolution by default. Only
`human-interaction-safeguard` can authorize composing and sending one described
reply. Defer eligibility and confirmation to it; classification stays
`HUMAN_STOP`. A draft-only request authorizes drafting only; posting still needs
separate approval. Reply confirmation does not authorize resolution, merging,
implementation, or unrelated actions. `AUTOMATION_FLOW` may continue below.
Both paths retain posting, identity, attribution, and independent approval gates.

## Disclaimer decision

A disclaimer is required when either condition is true:

`uses_personal_credentials OR explicitly_attributes_user`

- Personal credentials/token or the user's account: **Yes**.
- Bot, app, or service credentials plus explicit user attribution: **Yes**.
- Bot, app, or service credentials with no user attribution: **No**.
- Unknown credential/account provenance: **Pause and ask before posting**.

`UNATTRIBUTED_BOT_APP_SERVICE_DISCLAIMER = NO`.

Never infer **No** from service credentials alone. Explicit user attribution
overrides the service identity. Attribution includes the user's username or
handle, display or real name, a byline, or wording such as "by" or "on behalf
of." A display-name byline without a username still requires the disclaimer:
**Yes** for a bot/service post saying `Prepared by Ariel Valentin`, even with
its own credentials and no username shown. Likewise, `on behalf of @octocat`
requires the disclaimer.

## Identifying the user

Invoke `resolve-github-user` only when the substantive post needs the user's
identity for explicit attribution. Do not look up a username, model, or
provider solely to render the disclaimer.

## Authoring and placement

After the interaction gate permits drafting, load `writing-voice` for voice,
evidence, rationale, structure, and validation detail. Apply its final reader
check immediately before every permitted post, including new PR/issue bodies.
Writing guidance grants no posting permission. Follow **GitHub tool routing**.

For PR descriptions, also load its artifact-authoring reference. Preserve
relevant direct issue references (`Closes`/`Fixes owner/repo#N`), required
tracking, or the documented absence of issue tracking when repository guidance
requires it. Include ADR references when they informed a decision. These are
content requirements, not mandatory section headings.

For every permitted post:

1. Preserve the supplied substantive body subject to the disclosure boundary.
   For permitted PR feedback replies, include the related commit SHA
   (`Fixed in <sha>`) only when verified public for a public destination, or
   private with an audience authorized to access that repository. Otherwise
   use a non-sensitive description.
2. For issue-ops slash commands (for example, `/catalog-diff`), keep the command
   as the exact first line; prefix it with nothing.
3. Apply the disclaimer decision above. When required, append a blank line and
   the exact footer below as the final paragraph of the agent-composed body,
   after any SHA or other content. Do not include a username, model, or provider
   in it. This covers PR/issue bodies, comments, review replies, release notes,
   and similar public/shared text. Leave tool-added notices untouched.
4. Before posting, verify any required disclaimer is last. When other content
   follows a slash command, never put the disclaimer immediately after the
   command. Do not add a disclaimer for a known unattributed bot/app/service.

## If no issue is provided

1. If repository guidance requires an issue, search for likely existing issues
   first when Issues are available, following **GitHub tool routing**.
2. Confirm the candidate with the user before assuming.
3. If nothing matches, ask whether to open a new issue; never create one without
   authorization. Required tracking blocks publication until resolved.
4. If Issues are disabled, use the repository's supported tracking mechanism.
   If none exists and none is required, proceed without tracking boilerplate.
5. If the repository does not require an issue, do not add that requirement.

## Posting template

Use this exact final paragraph, including the leading `> `, when a disclaimer is required:

> _AI Assisted._

## PR safety gate

Before PR creation or management, use the already-loaded `pr-lifecycle` or load
it for phase, title, template, and readiness decisions. If unavailable, use
only the fallback below.
Before any PR creation for code/config/script changes, including drafts,
built-in tools, and the `pr-lifecycle`-missing fallback:

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

## Skill-availability fallbacks

Use only these named fallbacks; other missing mandatory safeguards block their
gated action:

1. `adversarial-review` missing -> run a hostile `rubber-duck` consensus review
   and keep blocker/major fix loops before PR creation.
2. `pr-lifecycle` missing -> complete the local PR safety gate above before
   any creation; keep implementation and review/fix cycles local until it
   passes. Then, after PR creation is authorized, follow the
   repository's workflow. If no different workflow is specified, draft mode
   is the default. Before creating the PR, confirm that the head branch
   is already published or that the request or repository guidance also
   authorizes the required push. If repository guidance specifies a title
   format, follow and validate that format. Only when it is silent, use the
   Conventional title format below. Before creating, updating, or readying a
   PR, apply `git-publishing-safety`'s **PR title length** section independently
   of the format check.

   When the draft default applies, create the PR non-interactively in draft
   state with a valid title and a non-empty body. If repository guidance
   requires another workflow, use its required creation phase and state. If
   it requires opening a ready PR after gates pass, create it ready then.
   Follow **GitHub tool routing** for the creation and any later PR operations.
   Never use a `WIP:` placeholder title. When the
   repository does not specify another format, the title must be
   `<type>[(<scope>)][!]: <description>`, where `<type>` is
   one of `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `perf`,
   `build`, `revert`; `(<scope>)` is optional and `!` marks a breaking
   change. Validate the title against
   `^(feat|fix|docs|refactor|test|chore|ci|perf|build|revert)(\([^()\s]+\))?!?:\s+\S.*`.
3. `stage-pr` missing -> report staging as unavailable and proceed without
   staging automation.

---
name: repository-access
description: >
  Use when locating repositories, inspecting local or remote repository state,
  citing repository findings, or working with APM-managed skills and plugins.
---

# Repository access

## Find and inspect repositories

Prefer an existing local checkout when one is available. Inspect its current
branch, commit, and working-tree status before relying on its contents. Before
claiming that it reflects current remote state, identify the intended upstream
or target branch, refresh its remote reference when permitted, and compare the
local and remote SHAs, including whether the branch is ahead, behind, or
diverged. A successful fetch alone does not establish that the checkout is
current. Matching HEAD SHAs do not establish that modified or untracked files
are part of that commit. If references cannot be refreshed or compared,
identify the inspected commit SHA and state what remote state remains unknown;
identify uncommitted content separately or restrict claims to committed files.

If a repository required for the task is not available locally, first verify
that the task authorizes work on it, the source is verified, and repository
access is authorized. Tell the user which repository and source you plan to
clone. Check applicable tool and higher-priority confirmation requirements
before cloning; obtain any required confirmation before proceeding. If the
task authorizes the repository work and cloning is necessary to complete it,
the task authorization and notice are sufficient when no separate confirmation
is required. After verifying task scope, source, access, and any separate
confirmation, proceed with cloning. Do not ask for additional approval solely
to clone. Do not ask the user to reconfirm verified task scope, source, or
access.
Never clone silently. This does not authorize bypassing repository access
controls or using credentials the task does not authorize. Pause if the source,
access, or requested work is not authorized; otherwise, continue with another
authorized source.

For repository findings, cite the inspected commit SHA or a GitHub URL. Do not
present an inspected local snapshot as current remote state without checking it.
Use `writing-voice` to report source limits and distinguish inspected facts
from unknown remote state.

For public or shared output, follow `acting-on-behalf`'s audience-specific
disclosure boundary before using repository citations. Cite private
repository-local identifiers only in a verified private destination whose
audience is authorized to access that repository. It overrides the general
SHA-or-URL preference above.

## GitHub operations

For local repository state, use local `git`. For GitHub operations, follow
`acting-on-behalf`, which owns GitHub tool routing and posting safeguards.
Use exposed GitHub MCP tools for the operations they support.

## APM-managed skills and plugins

When APM manages skills or plugins, update their authoritative source and any
existing manifest or configuration that declares them, not generated installed
copies. Do not create a manifest solely to edit a skill or plugin, or modify
unrelated configuration. Do not assume all consumers use the same source
repository, manifest, or private setup.

---
name: pr-feedback-review
description: >
  Structured protocol for reviewing, researching, and responding to PR review
  comments — whether implementing fixes or rebutting invalid concerns.
---

# PR Feedback Review

Use when addressing PR feedback, whether implementing fixes or rebutting
concerns. Before any interaction-derived research or action, load
`human-interaction-safeguard` for complete-chain retrieval, classification, and
behavior. If unavailable, fail closed as `HUMAN_STOP`.

## When to Use

- User asks to "address PR feedback", "respond to review comments", "handle
  PR reviews", or "resolve PR threads"
- Calling agent handles an existing-PR iteration
- Any request to review and act on PR comment threads

## Protocol

### Step 1: Read, Classify, and Understand

Read **every** review comment and thread on the PR. Group comments and replies
into their complete relevant thread or conversation chain. For each chain:

- Classify every author through `human-interaction-safeguard`.
- Apply its thread/chain rule: any `HUMAN_STOP` item taints the whole chain.
  A chain proceeds as `AUTOMATION_FLOW` only when every item is authoritatively
  identified as Bot/App automation.
- Identify the **specific concern** (correctness, style, performance, security,
  design, docs, etc.)
- Note whether it's a blocking request, suggestion, or question
- Understand the reviewer's reasoning — not just what they said, but *why*

Do not skim or assume. Classify the actor before any research or action.

### Step 2: Stop for Human or Unknown Actors

For `HUMAN_STOP`, stop interaction-derived work and follow
`human-interaction-safeguard` for the private warning, eligibility, and
single-reply confirmation. Do not research a rebuttal, change the repository,
draft/post, or resolve from that interaction without its scoped authorization.
Unknown actors and incomplete retrieval cannot be overridden.

Classification stays `HUMAN_STOP` after confirmation; do not enter Steps 3-4 or
automate further iteration. A draft-only request never permits posting; reply
confirmation never permits implementation, resolution, merging, or unrelated
actions. A later, separate, explicit implementation instruction identifying
the concern may authorize code/config/test work, not replies or resolution.

Only completely retrieved `AUTOMATION_FLOW` chains continue to Step 3; never
split Bot/App comments out of a tainted chain.

For permitted drafts and private summaries, use `writing-voice`. Do not turn a
private summary of human feedback into a draft reply.

### Step 3: Research Permitted Feedback

For each concern, investigate:

- Read the code in question and surrounding context
- Check language/framework documentation and conventions
- Look at existing patterns in the repo (`AGENTS.md`, style guides, prior art)
- Consult relevant specs, RFCs, or official docs when the concern is about
  correctness or best practices
- Form your own informed conclusion about whether the feedback is valid

### Step 4: Decide and Act on Permitted Feedback

For `AUTOMATION_FLOW` threads, choose one, subject to the user's requested
scope and all remaining permission and posting gates:

#### Accept — the feedback is valid

1. Implement the fix (surgical change, don't over-correct)
2. Commit with a clear message referencing the concern
3. Reply to the comment:
   - Acknowledge the concern briefly
   - State `Fixed in <commit-sha>` only when that SHA is appropriate for the
     destination audience under `acting-on-behalf`'s disclosure boundary; otherwise
     describe the fix without a private identifier.
4. Resolve the thread

#### Rebut — the feedback is incorrect or misguided

1. Draft a respectful, evidence-based rebuttal
2. Include at least one of:
   - Link to official documentation
   - Link to language/framework spec
   - Code example showing why the current approach is correct
   - Reference to an existing repo convention or `AGENTS.md` rule
3. Reply to the comment with your rebuttal
4. **Do NOT resolve the thread** — let the reviewer decide

#### Clarify — the comment is ambiguous or needs discussion

1. Reply with a specific clarifying question
2. Do NOT resolve the thread
3. Do NOT implement speculative changes

### Step 5: Verify

After all comments are addressed:

1. Run the relevant test/lint/build commands to verify nothing broke
2. Resume `pr-lifecycle` Phase 4 if changes were pushed
3. Summarize actions taken:
   - Human/unknown comments routed to the user (no automated action)
   - Comments accepted (with disclosure-safe commit references)
   - Comments rebutted (with evidence cited)
   - Comments needing clarification (questions asked)

## Rules

- **Always load `acting-on-behalf`** before posting any permitted reply; if
  unavailable or disclosure is unresolved, do not post.
- **Never blindly apply** bot/app suggestions — use judgement backed by evidence
- **Never ignore** valid bot/app concerns — if you're unsure, lean toward
  accepting
- **One commit per logical fix** when addressing multiple comments (don't lump
  unrelated fixes)
- **Keep fixes scoped** to what the reviewer asked — don't refactor adjacent code
- **Be respectful** in rebuttals — disagree with evidence, not attitude
