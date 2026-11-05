---
name: pr-lifecycle
description: >
  End-to-end PR management from creation through merge and cleanup.
  Covers: opening authorized PRs, finalizing descriptions, shepherding an
  existing PR through review feedback and CI to a clean, merge-ready state,
  monitoring CI, waiting for Copilot review, and post-merge session cleanup.
  Use for requests to manage an existing PR, including handoffs named `manage-pr`.
---

# PR Lifecycle

Single source of truth for every phase of a pull request.

Read repository guidance first. Its title/commit format, tracking, templates,
validation, review, and release conventions take precedence over project
defaults below, including Conventional Commits and its title regex when a
different format is required. Do not impose this producer repository's release
strategy on consumers.
Permission, human-interaction, attribution, and mandatory safety/review gates
still apply.

For PR titles and bodies, load `writing-voice` and its
`references/artifact-authoring.md` for authoring and the final pre-post reader
check. Use `acting-on-behalf` for posting permission and conditional attribution.
This applies to initial creation and later updates. Check applicable PR templates
in the repository root, `docs/`, and `.github/`, including template directories,
before either phase; apply the canonical template and content rules there.

Resolve the exact repository first; resolve the PR once one exists. A bare PR number means the active
repository only; pass `--repo <owner>/<repo>` to every repository-scoped
`gh` command, including `gh pr` and `gh run`, and use that exact repository in
`gh api` paths. Replace placeholders in command examples with the resolved
owner, repository, and PR number. If the target cannot be identified
unambiguously, ask before reading or acting.

## Trigger phrases

- "create a PR", "open a draft PR", "push this and open a PR"
- "manage-pr", "shepherd an existing PR through feedback and CI"
- "address PR feedback", "respond to review comments", "iterate on a PR"
- "watch CI", "monitor checks", "wait for Copilot review"

## Existing PR entrypoint

For a request to shepherd an existing PR, do not enter Phases 1–3. Inspect its
latest state. If it is already merged, report that state and stop; do not infer
a cleanup request or enter Phase 8 for a status-only request. If closed,
notify the user and stop; only an open PR proceeds to Phase 4. Do not create or
retitle a PR unless the user asks.
For an existing draft, keep it in draft while required checks or feedback gates
remain. After Phase 4 checks pass, retrieve and classify all feedback through
Phase 6 before the review wait; address actionable feedback only through its
safeguards, rerunning checks and feedback retrieval after each push. Once checks
pass and feedback processing leaves no actionable finding, unresolved
clarification, or required permitted reply, mark it ready only when the user or
repository guidance authorizes that transition. Do not mark the PR ready just
to trigger required checks that cannot pass while it is a draft; report that
blocker and stop. Immediately before a permitted transition, take two
consecutive complete snapshots. In each, record opening PR state, title,
head/base SHAs, base name, merge state, and the complete reviewer-request set
using the endpoint and validation defined in Phase 5. Retrieve complete
PR state with this command for each opening, closing, and final read:

```bash
gh pr view <number> --repo <owner>/<repo> --json state,isDraft,title,headRefOid,baseRefOid,baseRefName,mergeStateStatus
```

Retrieve policy/check evidence and all Phase 6 feedback surfaces, then repeat both
retrievals. Finish with fresh PR and reviewer-request reads after the last
feedback page. Retrieve and classify all feedback surfaces again after those
closing reads, then retrieve policy/check evidence once more. Finish with one
final PR-state and reviewer-request read after those final evidence reads.
Compare opening, closing, and final PR/reviewer values and all repeated
policy/check and feedback evidence within and across snapshots. Any mismatch
invalidates the transition; return to Phase 4 and the applicable feedback
handling. Require the PR to
remain open and a draft, the head/base/base-name tuple to match Phase 4, all
required checks to pass, the reviewer-request sets to remain unchanged, and
the feedback sets to match the fully processed set with no new actionable
finding, unresolved clarification, or required permitted reply. If these
conditions hold and the current title passes § Title format, run:

```bash
gh pr ready <number> --repo <owner>/<repo>
```

If transition authority is absent, report the draft blocker and stop. After a
transition, discard all earlier readiness evidence and restart Phases 4–6 for
the current PR state; this path never creates or retitles the PR. The snapshots
above are the draft-transition gate, not Phase 7's readiness snapshots. Do not
wait for Copilot review or enter Phase 7 while the PR remains a draft.
Before any implementation or fix dispatch, including a Phase 4 CI fix, verify
the PR is still open and verify the active repository, worktree, branch, local
changes, and PR head against the latest PR state. Recheck immediately before
editing. A mismatched or dirty checkout is a hard stop: do not dispatch fixes
or edit files; locate the correct worktree.
Before any direct or delegated fix work, follow `git-publishing-safety` and
confirm that the requested change and any required publication actions are
authorized. Do not edit or dispatch implementation when that gate is unmet.
Follow it again before committing or pushing.
This skill owns `manage-pr` handoffs and all existing-PR feedback, CI, and
merge-readiness phases. Use `review-fix-loop` only to implement authorized
fixes, never as the lifecycle entrypoint.

## Standalone waits

Requests limited to monitoring CI or Copilot review stay standalone, whether
the user asks for one status check or bounded waiting. They do not start the
full PR loop or authorize changes.
Use the bounded read-only `watch-ci` helper for CI-only waits and
`wait-for-copilot-code-review` for Copilot-only waits when available for the
resolved target. Otherwise, make one read-only status check: use
`gh pr checks <number> --repo <owner>/<repo>` for CI,
or inspect Phase 5 review requests/reviews once for Copilot. Do not use
`--watch`, poll, dispatch fixes, or start the full loop in this fallback.

---

## Phase 1 — Local preparation

For `feature`, `bugfix`, and `refactor` flows:

1. Prepare the local branch and task context. Do not push or create a PR yet,
   even a draft. Publication permission alone does not satisfy local review.
2. Keep tracking and continuation state local: repository, branch, base
   revision, task/issue references when applicable, validation and review
   outcomes, unresolved findings, and the next step. A PR number or URL is not
   required before Phase 3; do not create a PR just to obtain one.
3. Research-only flows do not create a PR. If creation is declined or not
   authorized, complete the local work and report the publication gate.

## Phase 2 — Implementation & gates

Follow `repository-work`'s task-ownership rule: use the installed `implementer`
when delegation is available and permitted; otherwise, the calling agent owns
implementation. Preserve PR lifecycle orchestration and review gates
(`review-fix-loop`). No coordinator agent is required.
Keep implementation, validation, and the required adversarial local
review/fix cycle local. Run `adversarial-review` through `review-fix-loop`
against the completed diff and relevant context. Address blocker/major
findings and re-review after fixes until the existing acceptance criteria
pass. Incomplete reviews, unresolved blocker/major findings, or exhausted
retries block PR creation; escalate rather than publish with a warning.
Preserve the existing explicit user-waiver path for adversarial review;
publication authorization or a request for an early draft is not a waiver.
Any subsequent diff change invalidates local acceptance: rerun affected
validation and review gates before creation. On continuation, verify that
recorded acceptance still covers the current diff instead of assuming a PR
already exists.

## Phase 3 — Create draft PR after local acceptance

Only when implementation is complete and local gates pass (or an applicable
explicit review waiver is recorded):

Before PR creation or any required branch push, follow
`git-publishing-safety` for publication authorization. Apply
`acting-on-behalf` for posting permission and disclosure. Local acceptance
does not authorize publication.

1. Recheck the applicable PR template and preserve its structure and required
   answers under `writing-voice`'s artifact-authoring rules.
2. Follow the repository's title format. For the default Conventional format,
   derive the complete header — `<type>`, optional scope, optional `!`, and
   wording — from the final diff before creation. The flow-to-type mapping
   (`feature` → `feat`, `bugfix` → `fix`, `refactor` → `refactor`) is a default,
   not absolute: use `docs`, `test`, `chore`, `ci`, `perf`, `build`, or `revert`
   when the actual change calls for it. Validate against § Title format.
   When no PR exists, prepare title text only and pass it to step 4's
   `--title`; do not run `gh pr edit` or invent a PR number.
   Preserve the validated scope and `!` in the creation title when applicable.
   This phase only prepares a new PR; it does not retitle an existing PR.
3. Prepare the body using `writing-voice`, including its validation-detail
   rules. Follow the repository template when present; otherwise use only the
   structure this change needs. Follow repository tracking requirements; do
   not invent a required issue when none applies. Preserve relevant issue and
   ADR references and apply conditional AI attribution via `acting-on-behalf`.
   PR-body attribution is not part of feedback processing:
   `pr-feedback-review` never decides attribution. `acting-on-behalf` is the
   sole source of truth for whether a PR body needs AI attribution.
4. If no PR exists and publication is authorized under
   `git-publishing-safety`, follow the repository's required creation phase and
   readiness state, but never create before local acceptance. By default,
   create a **draft PR** with the validated title and complete body, never a
   placeholder like `WIP: <goal>`:
   ```bash
   gh pr create --repo <owner>/<repo> --draft --title "<validated-title>" --body "<problem/value summary + required tracking>"
   ```
   When guidance requires the PR to be opened ready only
   after gates pass, create it here without `--draft`:
   ```bash
   gh pr create --repo <owner>/<repo> --title "<validated-title>" --body "<problem/value summary + required tracking>"
   ```
   If repository guidance prescribes another command or state, follow it
   after local acceptance. If a PR already exists, do not create a duplicate;
   use the Existing PR entrypoint. Record its number/URL in continuation state
   only after creation succeeds; failed creation is not a published PR.
5. Continue to Phase 4. A newly created draft uses the Existing PR entrypoint's
   draft checks, feedback handling, authorization, and transition snapshots
   before `gh pr ready`. Local review acceptance is not remote readiness.
   Do not wait for Copilot review or enter Phase 7 while it remains a draft.
   Do not run `gh pr ready` for a PR that is already ready.

## Title format

First use the repository's required title format in every phase. If it differs
from Conventional Commits, validate that format instead of the regex below.
For example, a repository requiring a ticket prefix keeps that prefix.

Only when the repository supplies no title format, use these Conventional
Commits defaults for titles created or updated in Phase 3:

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
  Use `!` only for intentionally breaking changes, following the consuming
  repository's release and approval rules.
- Validate before creating, updating, or readying a PR title — whether
  through the built-in `create_pull_request`/`update_pull_request` tools
  or the `gh pr create`, `gh pr edit --title`, `gh pr ready` commands:
  `^(feat|fix|docs|refactor|test|chore|ci|perf|build|revert)(\([^()\s]+\))?!?:\s+\S.*`
  Conventional titles over 72 characters are invalid; follow
  `git-publishing-safety` for the shared length check. Use repository-required
  formats instead when they differ.
  This regex validates only the default Conventional format, not a different
  repository-required format.

## Phase 4 — Monitor CI

After every push, refresh the PR head and required-check policy. Inspect the
base branch's protection settings and all active rules that apply to it, even
when `gh pr checks --required` reports checks. Read classic branch-protection
checks and effective rules for the base branch:

```bash
gh api "repos/<owner>/<repo>/branches/<url-encoded-base>/protection/required_status_checks"
gh api --paginate "repos/<owner>/<repo>/rules/branches/<url-encoded-base>?per_page=100"
```

The effective rules endpoint includes applicable repository and organization
rulesets and excludes disabled or evaluate-only rules. Capture `baseRefName`
from the PR and percent-encode it as one path segment (for example,
`release/1.x` becomes `release%2F1.x`). Retrieve every effective-rules page.
Verify the base branch is readable, then read classic protection:

```bash
gh api "repos/<owner>/<repo>/branches/<url-encoded-base>"
gh api "repos/<owner>/<repo>/branches/<url-encoded-base>/protection"
gh auth status
```

The required-status-checks subresource's 404 alone is ambiguous. A successful
full-protection response with an absent or null `required_status_checks` means
no classic required checks. A 404 from the full-protection endpoint means no
classic protection only when the base branch is readable and the active
credential is independently verified to have access to this repository and
the endpoint's required settings-read permission. Check the credential type
and its scopes or permissions with `gh auth status` or the provider's
authoritative permission details. For a fine-grained or GitHub App token,
verify `Administration: read` and that the credential covers this repository;
for other credential types, verify the documented equivalent. Do not require
a human admin identity for an installation token. If repository access or the
required endpoint permission cannot be confirmed, treat the policy as unknown
and stop. Other API errors are blockers.

Build the required status-check set from classic protection and every
applicable ruleset. Also record the classic `required_status_checks.strict`
value and each ruleset's
`required_status_checks.parameters.strict_required_status_checks_policy`.
These determine whether a behind branch must be updated before merge. If an
applicable ruleset includes a rule with `type: "workflows"`, do not treat the
status-check set as complete or empty: this procedure does not evaluate those
separate workflow requirements. Stop and report that required-workflow
verification as unsupported rather than reporting readiness.

Capture the PR head and base, resolve the generated test-merge commit, verify
its parents, and retrieve check runs and commit statuses for both candidate
SHAs:

```bash
gh pr view <number> --repo <owner>/<repo> --json state,isDraft,headRefOid,baseRefOid,baseRefName,mergeStateStatus
gh api "repos/<owner>/<repo>/git/ref/pull/<number>/merge"
gh api "repos/<owner>/<repo>/commits/<merge-sha>"
gh api --paginate "repos/<owner>/<repo>/commits/<head-sha>/check-runs?filter=all&per_page=100"
gh api --paginate "repos/<owner>/<repo>/commits/<head-sha>/status?per_page=100"
gh api --paginate "repos/<owner>/<repo>/commits/<merge-sha>/check-runs?filter=all&per_page=100"
gh api --paginate "repos/<owner>/<repo>/commits/<merge-sha>/status?per_page=100"
gh api --paginate "repos/<owner>/<repo>/actions/runs?head_sha=<selected-sha>&per_page=100"
```

The merge commit must have exactly two parents. Parent 1 must equal the
captured base SHA; parent 2 must equal the captured head SHA. Select one
governing SHA before evaluating results. If
the verified test-merge commit has any status-check results, all required
contexts must pass on it; do not substitute a passing head result or combine
results across SHAs. Only when that commit has no status-check results may head
results govern. If the merge commit or its results cannot be verified, stop
and report the blocker.

When a required context is pinned to `app_id` or `integration_id`, the
check-run `app.id` must match. A same-named check from another producer does
not satisfy the requirement. A policy `app_id` or `integration_id` of `-1`,
or an omitted/unset producer restriction, allows any app; do not require a
literal ID match. A same-named legacy commit status cannot satisfy a policy-pinned requirement
unless its authoritative metadata proves that identity.

For check runs, request `filter=all` and compare attempts by check name and
producer across all suites. After excluding ineligible attempts, only the most
recent eligible attempt for the same name and producer supersedes an earlier
one; distinct check names or producers remain independent. For commit statuses,
use the latest status per context from the combined-status response; do not
retain superseded older records. If the latest eligible check run and latest
eligible commit status share a required context, both must pass.

For check runs whose `app.slug` is `github-actions`, match each run's
`check_suite.id` to `check_suite_id` in the paginated workflow-run results for
the selected SHA. Both the check run's `head_sha` and the matched workflow
run's `head_sha` must equal the selected SHA. Count an Actions workflow-job check
only when its event is eligible
for PR checks: `push`, `pull_request`, `pull_request_review`,
`pull_request_target`, `deployment`, or `deployment_status`; include
`dynamic` for GitHub-generated workflows such as CodeQL default setup; include
`merge_group` for merge-queue checks. `workflow_dispatch` is ineligible for
PR-required checks and must not supersede an eligible attempt. Do not
apply this event restriction to checks created by another GitHub App; match
those by the configured producer instead. If an Actions run
or its event cannot be verified, treat that result as unavailable, not passing.

If the required set is nonempty, wait up to 10 minutes for the selected SHA's
policy-derived contexts. Use `watch-ci` only if it can monitor that exact SHA
and report the required contexts with producer identity; otherwise, poll the
check-run, commit-status, and applicable workflow-run APIs for the selected SHA
every 30 seconds. Refresh the candidate results and reselect the governing SHA
during each poll. Do not
use `gh pr checks` or the PR rollup as the required-check gate because those
results may describe only the head. A timeout leaves CI pending: report it and
stop without claiming readiness. Do not use an unbounded `--watch`. If both
policy sources are verified and the set is empty, skip required-check waiting
and inspect all current results once. A recognized no-checks response does not
by itself mean either an empty policy or an API failure; authentication,
access, and other command errors remain blockers.

For check runs, only completed conclusions `success`, `neutral`, and `skipped`
pass;
`queued`, `in_progress`, `waiting`, `requested`, `pending`, and a missing
conclusion are pending; `failure`, `cancelled`, `timed_out`, `action_required`,
and `stale` do not pass. For commit statuses, only `success` passes, `pending`
remains pending, and `failure` or `error` fails. A missing required context
remains pending. Only a terminal required-check failure enters the
implementation/fix path; pending checks stay in the bounded wait.

**On required-check failure only:**
Optional check failures are reported separately and do not enter this fix path.
For a failed Actions job, inspect its associated run:

```bash
gh run view <run-id> --repo <owner>/<repo> --log-failed
```

For an external App check or legacy commit status, inspect its output/details
or target URL through the producing service. If the result cannot be inspected,
report the blocker and stop. Dispatch `implementer` only when the evidence
identifies an actionable repository defect; for an external service failure or
an unclear cause, report the blocker and stop without changing code. After a
permitted fix, re-run the affected gates, push the fix, and re-check the PR.
Use only check evidence as input to this path; do not use PR comments or review
feedback to select a required-check fix. The later feedback-routing pass still
applies `HUMAN_STOP` before any feedback action and stops the lifecycle.

Compare current results on the selected SHA with the complete policy-derived
required-check set. Optional check failures do not trigger implementation;
report them separately. Do not dispatch a fix solely because an optional check
failed. The allowed merge states include `mergeStateStatus=CLEAN` and
`UNSTABLE`. `UNSTABLE` is allowed when policy and required-check results are
verified and every required check passes, even if optional checks fail; report
optional failures separately.
Accept `mergeStateStatus=BEHIND` only when every applicable strict/up-to-date
requirement is verified false; if any is true or unknown, do not report ready.
Other merge states do not pass the readiness gate.
Take a fresh state snapshot before fixing feedback and after every push. These
are separate refresh points; a push invalidates earlier CI and review evidence.
Record the PR state (open, closed, or merged), current head SHA, review-thread
state, CI rollup, and merge state.
Use the selected governing SHA for required checks and the head SHA for review
coverage. Do not report a clean state from stale checks or review data.
After a head change, earlier CI and review coverage is stale; repeat the
relevant checks for the new head. The older review cannot count as new-head
coverage. Complete the Phase 5 wait for that head once; do not restart it just
because earlier reviews remain. Revalidate any earlier findings against the
current diff. For a CI-only wait, use `watch-ci` when available.

```bash
set -e -o pipefail
gh pr view <number> --repo <owner>/<repo> --json state,isDraft,headRefOid,baseRefOid,baseRefName,mergeStateStatus,statusCheckRollup
```

`statusCheckRollup` is supplemental only. The feedback-routing substep is
read-only and is not readiness evidence; it does not restrict the separate
required-check remediation path above. Record opening PR state, draft status,
head/base SHAs, and base name before policy/check retrieval. Phase 5 compares
its final PR read with these exact values; do not treat a later observed
revision as checked.
Retrieve and classify the complete feedback surfaces listed in Phase 6 using
`human-interaction-safeguard`; do not run Phase 7's repeated snapshot sequence
here. This feedback-routing pass never replies, resolves, or dispatches a
feedback fix. If any feedback is `HUMAN_STOP`, return control to the user
immediately. If actionable feedback is found on an existing draft, route it
to Phase 6 now; after each permitted fix or push, restart Phase 4 and retrieve
and classify feedback again. For a non-draft PR, queue actionable feedback for
Phase 6 after Phase 5. Do not use this read as readiness evidence. Otherwise,
proceed to Phase 5 after this single read. Only Phase 7's two final snapshots
can establish readiness.

Missing required contexts are not an empty policy or a pass. If either policy
source or check results cannot be verified, do not report the PR ready.

## Phase 5 — Wait for Copilot code review

After required checks pass, retrieve and canonicalize the complete set of
requested reviewers from GitHub's all-reviewers endpoint:

```bash
set -e -o pipefail
gh api "repos/<owner>/<repo>/pulls/<number>/requested_reviewers" \
  --jq 'def no_control:
    (test("[[:cntrl:]]") | not);
    def valid_node_id:
      (.node_id | type) == "string" and (.node_id | length) > 0
      and (.node_id | no_control)
      and ((.node_id | gsub("^\\s+|\\s+$"; "")) == .node_id);
    if type != "object" or (.users | type) != "array" or (.teams | type) != "array"
    then error("invalid requested reviewers response")
    else
      ([.users[] |
        if type == "object" and valid_node_id and (.type | type) == "string"
          and (.type | length) > 0 and (.type | no_control)
          and ((.type | gsub("^\\s+|\\s+$"; "")) == .type)
        then ["user", .type, .node_id] | @json
        else error("invalid requested user") end]
       + [.teams[] |
        if type == "object" and valid_node_id
          and (.type == "enterprise" or .type == "organization")
        then ["team", .type, .node_id] | @json
        else error("invalid requested team") end])
      | .[]
    end' \
  | LC_ALL=C sort -u
```

This endpoint returns all requested users and teams in one response; it has no
pagination parameters. If retrieval fails or either identity list is missing
or malformed, stop; never treat an unknown or partial set as empty.
Immediately before starting the review timer, reread and compare PR state,
draft status, head/base SHAs, and base name with the Phase 4 values for which
checks passed:

```bash
set -e -o pipefail
gh pr view <number> --repo <owner>/<repo> --json state,isDraft,headRefOid,baseRefOid,baseRefName
```

The PR must be open and non-draft. If it is closed or merged, follow the
existing closed/merged handling; if it is a draft, follow the Existing PR
entrypoint's transition path or report the authorization blocker and stop. If
any compared value differs, return to Phase 4 and refresh policy, checks, and
feedback before starting the review wait.

The 10-minute wait starts immediately before the first completed-review poll.
Those entry checks do not count toward the wait. If polling directly, poll every
30 seconds and stop after 10 minutes:

```bash
set -e -o pipefail
gh api --paginate "repos/<owner>/<repo>/pulls/<number>/reviews" \
  --jq 'def no_control: (test("[[:cntrl:]]") | not);
    def valid_review:
      type == "object"
      and (.id | type) == "number" and (.id | floor) == .id and .id > 0
      and has("commit_id")
      and (.commit_id == null
        or ((.commit_id | type) == "string"
          and (.commit_id | test("^[0-9a-fA-F]{40}([0-9a-fA-F]{24})?$"))))
      and (.state == "APPROVED" or .state == "CHANGES_REQUESTED"
        or .state == "COMMENTED" or .state == "DISMISSED" or .state == "PENDING")
      and has("user")
      and (if .user == null then true
        else (.user | type) == "object"
          and (.user.type | type) == "string" and (.user.type | length) > 0
          and (.user.type | no_control)
          and ((.user.type | gsub("^\\s+|\\s+$"; "")) == .user.type)
          and (.user.login | type) == "string" and (.user.login | length) > 0
          and (.user.login | no_control)
          and ((.user.login | gsub("^\\s+|\\s+$"; "")) == .user.login)
        end)
      and (if .performed_via_github_app == null then true
        else (.performed_via_github_app | type) == "object"
          and (.performed_via_github_app.id | type) == "number"
          and (.performed_via_github_app.id | floor) == .performed_via_github_app.id
          and .performed_via_github_app.id > 0
        end);
    if type != "array" then error("invalid reviews response")
    else [.[] |
      if valid_review then
        select(.user != null
          and (.user.type == "Bot" or .performed_via_github_app != null))
        | {id, commit_id, state, user, performed_via_github_app}
      else error("invalid review record")
      end]
    end'
```

If a completed-review poll fails or pagination is incomplete, stop; do not
treat it as no review or count a timeout.
Immediately before accepting a candidate review or recording a timeout, reread
PR state, draft status, head/base SHAs, and base name. If any differs from the
Phase 5 entry values, return to Phase 4 and refresh policy, checks, and
feedback; do not accept the candidate or count a timeout for the stale head.

- Default to the 10-minute wait. Skip it only when repository guidance
  explicitly says Copilot review is disabled or the user explicitly asks to
  skip it; no visible request or review is not evidence that it is disabled.
- Count a review as Copilot coverage only when its login is exactly
  `copilot-pull-request-reviewer[bot]` and authoritative actor metadata
  establishes it as a Bot/App. GitHub documents this exact reviewer identity.
  A login prefix or bot status alone is insufficient. If the identity cannot
  be verified, do not count it as Copilot coverage.
- A reviewer can disappear from pending requests after starting a review.
  Do not treat that as completion of Phase 5. Continue checking submitted
  reviews for a current-head review until the full 10-minute wait expires or
  one appears.
- A pending request is not a completed review or proof of the reviewer's actor
  type.
- If the requested-reviewer query fails or either identity list is incomplete,
  stop. Never treat an unknown or partial set as empty.
- Count a Copilot review as current-head coverage only when its state is
  `APPROVED`, `COMMENTED`, or `CHANGES_REQUESTED` and its `commit_id` matches
  the recorded current head SHA. A null commit ID is valid response data but
  cannot prove current-head coverage. `PENDING`, `DISMISSED`, or an earlier
  commit does not count as a completed current-head review.
- Before leaving Phase 5, record its outcome as current-head review coverage
  (review ID, state, commit ID, and authoritative actor metadata), bounded
  timeout (start/end and successful final poll), explicit repository guidance
  to skip (source), or user-authorized skip (instruction).
- Do not feed findings from a stale review directly into `review-fix-loop`.
  Recheck them against the current diff through the Phase 6 safeguards first.
- For a bounded, read-only wait for a single Copilot review, use
  `wait-for-copilot-code-review` when available.
- Phase 5 is only a bounded review wait. Queue findings for Phase 6, which must
  retrieve the complete conversation and apply `human-interaction-safeguard`
  before any action. A `HUMAN_STOP` classification ends the lifecycle and
  returns control to the user.
- If no findings or timeout: proceed.
- If repo doesn't use Copilot review: skip and note.
  This must be established by explicit repository guidance; absence of a
  request or review is not sufficient.

## Phase 6 — Process review feedback

Retrieve PR review comments, reviews, issue/PR comments, and GraphQL review
threads using the exact `gh api` commands in `human-interaction-safeguard`.
Do not classify actors from `gh pr view --json reviews,comments` or login text.
Exhaust both `reviewThreads` pages and every thread's independent `comments`
pages. Incomplete or failed pagination is `HUMAN_STOP` before automation.
Apply the thread/chain taint rule after retrieval: `AUTOMATION_FLOW` requires
every root comment and reply to have authoritative Bot/App metadata. Any
`HUMAN_STOP` item taints the entire chain, so no comment in it may trigger
implementation, an agent reply, or agent resolution.

Apply `human-interaction-safeguard` first. It is the sole source of truth for
actor classification and behavior:

- `HUMAN_STOP` → by default, return control to the user; do not initiate a change
  from the interaction, draft or post a reply, or resolve the thread. A later, separate,
  explicit implementation instruction may authorize code/config/test work;
  reply and resolution require their own approval.
  Defer any single-action exception exclusively to `human-interaction-safeguard`:
  warn about human interaction and obtain ordinary explicit user confirmation
  for the described action and target. Its authorization permits only that action,
  not lifecycle iteration, another operation, or classification as automation.
- `AUTOMATION_FLOW` → use `pr-feedback-review`.

Only after complete thread retrieval and `AUTOMATION_FLOW` classification may
supported, actionable findings enter `review-fix-loop`. A Phase 5 review alone
never authorizes a change.

Before changing files, verify the PR is still open and recheck the active
repository, worktree, branch, local changes, and PR head against the latest PR
state. A mismatched or dirty checkout is a hard stop: do not edit until the
correct worktree is located.

Keep review-driven fixes limited to supported, actionable findings. Do not add
drive-by refactors or unrelated improvements. If a valid fix needs broader
scope, stop and ask the user before expanding it.

After pushing fixes, do not automatically notify or re-request a reviewer.
Only do so when explicitly authorized by the user or required by repository
guidance, after applying `human-interaction-safeguard` and
`acting-on-behalf`. If notification is not authorized, skip it and continue the
authorized lifecycle by rerunning Phase 4. Stop only when another gate requires
user input or an action lacks authorization.

```bash
gh pr edit <number> --repo <owner>/<repo> --add-reviewer <reviewer>
```

Re-run Phase 4 after any push. For an existing draft routed from Phase 4, use
this complete exit rule, which takes precedence over generic loop routing:
stop and return control if clarification or another user response is pending;
after a push, rerun Phase 4; after completed processing with no push or pending
clarification, go directly to the existing-draft transition snapshots, which
refresh checks and feedback. Do not repeat Phase 4 or Phase 6 in that no-push
case or act on unchanged feedback again. Record handled findings and their
feedback state so they are not replied to, resolved, or fixed twice. Count
each draft feedback iteration toward Phase 7's 10-iteration limit; after 10,
stop and report unresolved items instead of attempting a transition. Do not
fall through to Phase 5 or Phase 7 while the PR remains a draft.

## Phase 7 — Loop exit conditions

Before evaluating the exit condition, confirm that required checks passed on
the current head or its verified generated merge commit for that head/base.
Do not take a separate Phase 4 snapshot here; the two ordered snapshots below
are the authoritative readiness evidence. Only a Copilot review that
counts as current-head coverage must match the head SHA;
earlier reviews do not count as coverage, and their findings must be
revalidated against the current diff. Keep the head SHA, base SHA, and base
name from the Phase 4 values accepted at Phase 5 entry. Both final snapshots
must match that tuple. If any value changes after the Phase 5 outcome, rerun
Phase 4 and re-evaluate Phase 5 for the new PR diff; do not carry over review
coverage or timeout evidence from the prior tuple.
Copilot review is accounted for only when a current-head review was processed,
the Phase 5 10-minute wait ended without a current-head review, the repository
does not use Copilot review, or the user explicitly asked to skip it. When
reporting readiness after a timeout or skip, state which occurred. The PR must
remain open and non-draft, all required checks in the fresh result set must
pass, and `mergeStateStatus` must be `CLEAN` or `UNSTABLE` with verified
required-check policy and results, or `BEHIND` with every applicable
strict/up-to-date requirement verified false. Otherwise, do not report it
ready and continue only through the existing bounded steps or report blockers.

Before reporting readiness, take two consecutive complete snapshots. In each,
record opening PR state, draft status, head/base SHAs, base name, merge state,
and the complete review-request set; retrieve complete policy/check evidence
and all review, comment, and thread pages. Repeat policy/check and feedback retrieval, then finish with fresh PR state,
draft status, head/base/base-name, and merge state reads plus a fresh complete
reviewer-set read. Retrieve and classify all feedback surfaces again after
those closing reads, then retrieve complete policy/check evidence once more.
Finish with one final PR-state and reviewer-set read after those final
evidence reads. Compare the closing and final PR/reviewer reads with the
opening values, the final feedback with the earlier feedback sets, and the
final policy/check evidence with the earlier policy/check evidence; any
observed change invalidates the snapshot. Use
`human-interaction-safeguard` on every feedback read: `HUMAN_STOP` discards the
snapshot and returns control; actionable feedback discards it for Phase 6.
Never reply, resolve, or fix feedback inside a snapshot. Fail closed on any
incomplete page.

Canonicalize and compare sorted readiness-relevant fields:
policy rules, required contexts/producers and strictness; selected governing
SHA and any generated merge SHA/verified parent SHAs; check attempts, results,
and workflow events; review/comment IDs, states, bodies, and actor types;
thread IDs, resolution, and comments; and reviewer type-qualified IDs.
Within each snapshot, compare opening/closing PR and reviewer state, the
repeated policy/check evidence, and feedback sets. Across snapshots, compare
those same sets and PR state; also compare both snapshots' head/base/base-name
tuple with the tuple accepted at Phase 5 entry. Any mismatch or observed state
change invalidates both snapshots and requires a new pair. Reads are
sequential, not atomic; readiness does not guarantee GitHub cannot change
after the last read.
If Phase 5 used a review for coverage, both final snapshots must still contain
that review as current-head eligible with the recorded state and actor
metadata. If it becomes missing, dismissed, pending, stale, or unverifiable,
rerun Phase 4 and Phase 5 for that tuple or report the blocker; do not rely on
the earlier outcome.

Do not report ready while an actionable finding or unresolved clarification
remains. A rebutted thread is handled for readiness after its permitted,
evidence-based reply is posted through `pr-feedback-review` and
`acting-on-behalf`; its unresolved thread status alone is not a blocker. Stop
rather than report ready after 10 iterations.

| Condition | Action |
|-----------|--------|
| Two consecutive fresh snapshots agree: PR open and non-draft; all required checks pass on the selected governing SHA; Copilot review matches that head or is skipped/timed out; no actionable or unresolved clarification remains; any unresolved rebuttal has a permitted evidence-based reply; `mergeStateStatus=CLEAN` or eligible `UNSTABLE`, or `BEHIND` with every applicable strict/up-to-date requirement verified false | Notify user: ready to merge |
| Head changed or required-check evidence is stale | Rerun Phase 4/5 for the current head; revalidate earlier findings against the current diff; do not report ready |
| Required CI is still pending after the bounded wait | Report pending checks and stop; do not report ready |
| Phase 5 wait for current head is still active and no current-head review has appeared | Continue the bounded wait; do not report ready |
| PR merged | Phase 8 (cleanup) |
| PR closed | Notify user, stop |
| User says stop | Stop |
| 10 iterations reached | Stop, report unresolved items |

Yield control between iterations.

## Phase 8 — Post-merge cleanup

Phase 8 applies only when the PR merges during an active lifecycle request. If
the PR was already merged when the task began or the user only requested a
status check, report the state and stop without cleanup.

After the PR is **merged**:

1. `list_sessions_and_chats` → find sessions tied to the merged PR.
2. Archive a session only when the user explicitly requested cleanup or the
   archive tool's verified finished-child conditions permit it. Do not archive
   an active or user-owned session merely because the PR merged.
   Do not run Phase 8 for a status-only request or when the PR was already
   merged at task start.

---

## Skill fallbacks

| Missing tool | Fallback |
|-------------|----------|
| `create_pull_request` (built-in) | Only after Phase 2 local acceptance and publication authorization, and if repository guidance has no different workflow: `gh pr create --repo <owner>/<repo> --draft --title "<type>: <description>" --body "<problem/value summary + relevant issue ref>"` (non-interactive — never a bare `gh pr create --draft` with no `--body`, and never a `WIP:` placeholder); validate the title against § Title format first |
| `watch-ci` | For standalone CI status, use one read-only `gh pr checks <number> --repo <owner>/<repo>` query if unavailable. In full Phase 4, poll the selected SHA's check-run and status APIs every 30 seconds for up to 10 minutes; never use `gh pr checks` as the required-check gate |
| `stage-pr` | Report staging unavailable |

## Pre-requisites

- `human-interaction-safeguard` — source of truth for actor behavior.
- `acting-on-behalf` — posting and attribution backstop.
- `git-publishing-safety` — publication authorization, commit signing and
  history, and the shared Conventional title-length limit.
- `writing-voice` — shared authoring and final reader check.
- `pr-feedback-review` — bot/app feedback handling after actor classification.
- `review-fix-loop` — for gate iteration.
- `commit-message-storyteller` — for commit messages during fixes.
