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
This applies to early drafts and later updates. Check applicable PR templates
in the repository root, `docs/`, and `.github/`, including template directories,
before either phase; apply the canonical template and content rules there.

Resolve the exact repository and PR once. A bare PR number means the active
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
Before any implementation or fix dispatch, including a Phase 4 CI fix, verify
the PR is still open and verify the active repository, worktree, branch, local
changes, and PR head against the latest PR state. Recheck immediately before
editing. A mismatched or dirty checkout is a hard stop: do not dispatch fixes
or edit files; locate the correct worktree.
Before any direct or delegated fix work, follow `git-publishing-safety` and
confirm that the requested change and any required publication actions are
authorized. Do not edit or dispatch implementation when that gate is unmet.
Follow it again before committing or pushing.
This skill owns `manage-pr` handoffs; use `review-fix-loop` only as an
implementation helper, not as the lifecycle entrypoint.

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

## Phase 1 — Early draft PR

For `feature`, `bugfix`, and `refactor` flows:

Before PR creation or any required branch push, follow
`git-publishing-safety` for publication authorization.

1. Once publication is authorized under `git-publishing-safety`, and the
   repository does not prescribe another workflow, open an early **draft PR**
   with a valid title from the start, never a placeholder like `WIP: <goal>`.
   Follow the repository's required title format. Only if none is specified,
   use Conventional Commits:
   ```bash
   gh pr create --repo <owner>/<repo> --draft --title "<type>: <description>" --body "<problem/value summary + relevant issue ref>"
   ```
   - Default `<type>` from the canonical flow (`feature` → `feat`, `bugfix` →
     `fix`, `refactor` → `refactor`) and derive `<description>` from the
     goal — this mapping is a default, not an absolute. If the actual
     initial change is clearly `docs`, `test`, `chore`, `ci`, `perf`,
     `build`, or `revert` work, use that type instead.
   - Validate the title against § Title format before creating the PR.
2. Skip for `research` flows, when the user explicitly declines, or when
   repository guidance prescribes a different PR workflow, including creating
   the PR only after implementation gates pass.

## Phase 2 — Implementation & gates

Follow `repository-work`'s task-ownership rule: use the installed `implementer`
when delegation is available and permitted; otherwise, the calling agent owns
implementation. Preserve PR lifecycle orchestration and review gates
(`review-fix-loop`). No coordinator agent is required.
When the repository workflow uses an early draft, keep the PR in draft until
all gates pass. Otherwise preserve the state required by repository guidance;
do not introduce a draft transition.

## Phase 3 — Finalize PR

When implementation is complete and gates pass:

1. If no PR exists and publication is authorized under
   `git-publishing-safety`, follow the repository's required creation phase and
   readiness state. When guidance requires the PR to be opened ready only
   after gates pass, create it here without `--draft`:
   ```bash
   gh pr create --repo <owner>/<repo> --title "<validated-title>" --body "<problem/value summary + required tracking>"
   ```
   If repository guidance prescribes another command or state, follow it.
2. Recheck the applicable PR template and preserve its structure and required
   answers under `writing-voice`'s artifact-authoring rules.
3. Follow the repository's title format. For the default Conventional format,
   re-derive and correct the complete header — `<type>`, optional scope,
   optional `!`, and wording — from the final diff, not from the Phase 1 goal.
   The title already follows the chosen format from Phase 1; this step
   **corrects/refines** that header (the
   flow-default type may no longer fit, or a scope may now materially
   clarify the change) — it is never a deferred WIP-to-Conventional
   conversion. Validate against § Title format, then update using the
   corrected title itself (not the unscoped template — the corrected
   scope and `!` must survive):
   ```bash
   gh pr edit <number> --repo <owner>/<repo> --title "<validated-conventional-title>"
   ```
4. Rewrite the body using `writing-voice`, including its validation-detail
   rules. Follow the repository template when present; otherwise use only the
   structure this change needs. Follow repository tracking requirements; do
   not invent a required issue when none applies. Preserve relevant issue and
   ADR references and apply conditional AI attribution via `acting-on-behalf`.
   PR-body attribution is not part of feedback processing:
   `pr-feedback-review` never decides attribution. `acting-on-behalf` is the
   sole source of truth for whether a PR body needs AI attribution.
5. If the PR is in draft and the repository workflow calls for a
   ready-for-review transition, validate the title against § Title format,
   then mark it ready when all gates pass:
   ```bash
   gh pr ready <number> --repo <owner>/<repo>
   ```
   If repository guidance uses another workflow, follow its required state
   transition instead. Do not run `gh pr ready` for a PR that is already ready.

## Title format

First use the repository's required title format in every phase. If it differs
from Conventional Commits, validate that format instead of the regex below.
For example, a repository requiring a ticket prefix keeps that prefix.

Only when the repository supplies no title format, use these Conventional
Commits defaults for titles created or updated in Phase 1 and Phase 3:

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
  The regex does not enforce the shared title-length limit. Follow
  `git-publishing-safety` for that check. Use repository-required formats
  instead when they differ.
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

The merge commit must have exactly two parents, in order: captured base SHA,
then captured head SHA. Select one governing SHA before evaluating results. If
the verified test-merge commit has any status-check results, all required
contexts must pass on it; do not substitute a passing head result or combine
results across SHAs. Only when that commit has no status-check results may head
results govern. If the merge commit or its results cannot be verified, stop
and report the blocker.

Match each required context to its configured `app_id` or `integration_id`
when a concrete ID is present, using check-run `app.id` metadata. A policy
`app_id` of `-1`, or an omitted/unset producer restriction, allows any app;
do not require a literal ID match. A same-named legacy commit status cannot
satisfy a policy-pinned app/integration requirement unless its authoritative
metadata proves that identity.

For check runs, request `filter=all` and compare attempts by check name and
producer across all suites. After excluding ineligible attempts, only the most
recent eligible attempt for the same name and producer supersedes an earlier
one; distinct check names or producers remain independent. For commit statuses,
use the latest status per context from the combined-status response; do not
retain superseded older records. If the latest eligible check run and latest
eligible commit status share a required context, both must pass.

For check runs whose `app.slug` is `github-actions`, match each run's
`check_suite.id` to `check_suite_id` in the paginated workflow-run results for
the selected SHA. Count an Actions workflow-job check only when its event is eligible
for PR checks: `push`, `pull_request`, `pull_request_review`,
`pull_request_target`, `deployment`, or `deployment_status`; include
`merge_group` for merge-queue checks. A `workflow_dispatch` or other ineligible
event cannot satisfy a PR-required check and must not supersede an eligible
attempt. Do not apply this event restriction to checks created by another
GitHub App; match those by the configured producer instead. If an Actions run
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

For check runs, completed conclusions `success`, `neutral`, and `skipped` pass;
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

Compare current results on the selected SHA with the complete policy-derived
required-check set. Optional check failures do not trigger implementation;
report them separately. Do not dispatch a fix solely because an optional check
failed. The readiness gate accepts `mergeStateStatus=CLEAN` or `UNSTABLE` only
when policy and required-check results are verified and every required check
passes. In `UNSTABLE`, report optional failures separately. Accept
`mergeStateStatus=BEHIND` only when every applicable strict/up-to-date
requirement is verified false; if any is true or unknown, do not report ready.
Other merge states do not pass the readiness gate. Then proceed to Phase 5.
Take a fresh state snapshot before fixing feedback, after every push, and
before reporting the PR clean. These are separate refresh points; a push
invalidates earlier CI and review evidence. Record the PR state (open, closed,
or merged), current head SHA, review-thread state, CI rollup, and merge state.
Use the selected governing SHA for required checks and the head SHA for review
coverage. Do not report a clean state from stale checks or review data.
After a head change, earlier CI and review coverage is stale; repeat the
relevant checks for the new head. The older review cannot count as new-head
coverage. Complete the Phase 5 wait for that head once; do not restart it just
because earlier reviews remain. Revalidate any earlier findings against the
current diff. For a CI-only wait, use `watch-ci` when available.

```bash
gh pr view <number> --repo <owner>/<repo> --json state,isDraft,headRefOid,baseRefOid,baseRefName,mergeStateStatus,statusCheckRollup
```

`statusCheckRollup` is supplemental only. Repeat the policy and candidate SHA
result retrieval described above, then confirm the PR head/base did not change.
Retrieve every review-thread page through the exact `gh api` commands in
`human-interaction-safeguard`. If any SHA, policy, or result changed, discard
the snapshot and rerun Phase 4.

Missing required contexts are not an empty policy or a pass. If either policy
source or check results cannot be verified, do not report the PR ready.

## Phase 5 — Wait for Copilot code review

After CI passes, inspect pending review requests and completed reviews:

```bash
gh pr view <number> --repo <owner>/<repo> --json headRefOid,reviewRequests
```

```bash
gh api --paginate "repos/<owner>/<repo>/pulls/<number>/reviews" \
  --jq '[.[] | select(.user.type == "Bot" or .performed_via_github_app != null) | {commit_id, state, user, performed_via_github_app}]'
```

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
- Count a Copilot review as current-head coverage only when its state is
  `APPROVED`, `COMMENTED`, or `CHANGES_REQUESTED` and its `commit_id` matches
  the recorded current head SHA. `PENDING`, `DISMISSED`, or an earlier commit
  does not count as a completed current-head review.
- Do not feed findings from a stale review directly into `review-fix-loop`.
  Recheck them against the current diff through the Phase 6 safeguards first.
- For a bounded, read-only wait for a single Copilot review, use
  `wait-for-copilot-code-review` when available.
- The 10-minute wait starts when Phase 5 begins after CI passes. If polling
  directly, poll every 30s and stop after 10 minutes.
- If findings: record them for Phase 6. Do not dispatch fixes before the full
  thread retrieval and safeguard classification there.
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

Re-run Phase 4 after any push.

## Phase 7 — Loop exit conditions

Before evaluating the exit condition, refresh the Phase 4 PR and check snapshot
and record its head and base SHA. Required checks must pass on that head or its
verified generated merge commit for that head/base. Only a Copilot review that
counts as current-head coverage must match the head SHA;
earlier reviews do not count as coverage, and their findings must be
revalidated against the current diff. If the head changes, rerun Phase 4 and
Phase 5 for the new head. Once the Phase 5 wait for that head ends, an older
review does not restart the wait or block readiness.
Copilot review is accounted for only when a current-head review was processed,
the Phase 5 10-minute wait ended without a current-head review, the repository
does not use Copilot review, or the user explicitly asked to skip it. When
reporting readiness after a timeout or skip, state which occurred. The PR must
remain open and non-draft, all required checks in the fresh result set must
pass, and `mergeStateStatus` must be `CLEAN` or `UNSTABLE` with verified
required-check policy and results, or `BEHIND` with every applicable
strict/up-to-date requirement verified false. Otherwise, do not report it
ready and continue only through the existing bounded steps or report blockers.

Before reporting readiness, take two consecutive complete final snapshots.
For each snapshot, repeat Phase 4's policy and check retrieval, including
classic protection, every effective-rules page, the complete policy-derived
required-check set with producer restrictions, strict/up-to-date policy, check
attempts, and matching workflow-run event metadata for the selected governing
SHA. Each snapshot also includes PR state, head/base SHAs and base name, merge
state, all reviews, inline comments, issue/PR comments, every review-thread
page, and every thread's independent comments page. Repeat the complete Phase 6
retrieval for each snapshot; do not treat reviews, comments, or threads as
single-page results. Use `human-interaction-safeguard` to classify all newly
retrieved feedback. Any `HUMAN_STOP` feedback returns control to the user.
Process each new actionable
`AUTOMATION_FLOW` finding through Phase 6 before readiness; do not report ready
while an actionable finding remains unprocessed. Do not require a rebutted
thread to be resolved for readiness: after its permitted evidence-based reply
is posted through `pr-feedback-review` and `acting-on-behalf`, it is handled
for this gate and may remain open for the reviewer. An unresolved clarification
or actionable thread blocks readiness. The snapshots must agree on PR, policy,
check, and feedback/thread state, and no actionable finding may remain. If the
PR is no longer open or is a draft, the head or base differs, required checks
changed or are no longer passing, the merge state is neither `CLEAN` nor an
eligible `UNSTABLE` nor `BEHIND` with every applicable strict/up-to-date
requirement verified false, feedback/thread state changed, or actionable or
clarification feedback remains, discard readiness evidence and repeat the
relevant phases and final snapshots. Stop rather than report ready after 10
iterations.

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
| `create_pull_request` (built-in) | After PR creation is authorized and if repository guidance has no different workflow: `gh pr create --repo <owner>/<repo> --draft --title "<type>: <description>" --body "<problem/value summary + relevant issue ref>"` (non-interactive — never a bare `gh pr create --draft` with no `--body`, and never a `WIP:` placeholder); validate the title against § Title format first |
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
