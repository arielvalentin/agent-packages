## Phase 4 — Monitor CI

Use one monitoring owner per repository/PR/head. When monitoring is delegated,
the designated owner handles CI and Copilot-review monitoring for that exact
head; the coordinator and worker must not start duplicate watches or waits. A
changed head invalidates prior results and requires one owner for the new head.

After every push, refresh the PR head and required-check policy. Inspect the
base branch's protection settings and all active rules that apply to it, even
when `gh pr checks --required` reports checks.

At Phase 4 entry, start one absolute 10-minute deadline before fetching either
policy source or retrying tuple/policy stabilization. This same deadline
covers initial policy reads, every policy revalidation, any empty-to-nonempty
transition, and required-check polling; never reset or extend it. If policy
cannot be verified before the deadline, stop and report policy unknown.

Before fetching policy, record the exact PR tuple `headRefOid`, `baseRefOid`,
and `baseRefName`. Read classic branch-protection checks and effective rules
for that base branch:

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

After both policy sources are fetched, re-read the PR tuple. If any member
changed during the fetch, discard the policy and repeat both source reads for
the current tuple. Bind the verified policy to the exact stable tuple used to
retrieve it, including when the required set is empty. Do not evaluate checks
using an unbound policy.

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

Use the original deadline for initial policy retrieval and all stabilization
retries. Tuple refreshes and cycle restarts do not reset or extend it. The
initial result inspection is the first evidence cycle below. For
a nonempty required set, wait exactly 30 seconds between evidence cycles,
including cycles restarted after a tuple or policy change. If less than 30
seconds remain, wait only until the original deadline and stop without
starting another cycle. Use `watch-ci` only if it can perform the same
complete polling and tuple-revalidation procedure below within that original
deadline, monitor the selected SHA, and report required contexts with producer
identity; otherwise poll the APIs directly.

For each evidence cycle, including the initial inspection and the empty-policy
one-shot inspection:

1. Discard the previous poll's results. Refresh and record the exact current
   PR tuple: `headRefOid`, `baseRefOid`, and `baseRefName`. Refresh both policy
   sources for the current `baseRefName` on every evidence cycle, even when
   the tuple is unchanged. Re-read the PR tuple after both reads. If any tuple
   member changed during the refresh, discard both policy responses and repeat
   both reads for the current tuple within the original deadline; do not
   retrieve check evidence using an unstable policy. Otherwise, compare the
   full policy snapshot from both sources and the stable tuple with the
   currently bound policy snapshot before retrieving or classifying check
   evidence. If the policy snapshot changes while the tuple remains stable,
   discard all prior evidence, bind the refreshed policy only to its stable
   tuple, and start a fresh cycle within the original deadline. If either the
   policy snapshot or tuple differs from the currently bound snapshot, discard
   prior evidence and start a fresh cycle with the stable binding. A stable
   tuple does not make changed policy current. If revalidation changes an
   empty policy to nonempty, discard the empty-policy evidence and enter
   ordinary 30-second bounded polling, including when the base name changed;
   never stop or classify against the empty snapshot. Resolve the test-merge
   commit, verify its parents, and retrieve all pages of check runs and commit
   statuses for both candidate SHAs using the initial API requests above.
   Request check runs with `filter=all`.
2. Select exactly one governing SHA using the same merge-first rule above.
   Retrieve all pages of workflow runs filtered by `head_sha=<selected-sha>`
   for Actions check-run event and producer verification, as applicable.
3. After fetching the workflow-run evidence, close the cycle by re-reading
   the PR tuple and refreshing classic branch protection and every applicable
   effective-ruleset page for the current base. Read both policy sources even
   when all three tuple members still match the opening tuple. Re-read the
   PR tuple after those policy reads. Compare the closing
   `headRefOid`, `baseRefOid`, and `baseRefName` with the opening tuple, and
   compare the full closing policy snapshot with the policy snapshot bound
   before evidence retrieval. The full snapshot includes the required
   contexts and producer pins, classic and ruleset strict/up-to-date values,
   and applicable rules that make workflow verification unsupported. Any
   tuple or policy change invalidates all check, status, and workflow evidence
   from the cycle. Discard it, stabilize both policy sources against the
   current tuple as in step 1, bind the refreshed policy only to that stable
   tuple, and start a fresh cycle within the original deadline. This also
   applies when the tuple is unchanged but the policy changes. If closing
   revalidation changes an empty policy to nonempty, enter ordinary bounded
   30-second polling, including when `baseRefName` changed. If the closing
   tuple and full policy snapshot match the opening binding and the set
   remains empty, the current evidence cycle is complete: classify its results
   and do not repeat the one-shot in this stable case. Repeat an empty-policy
   one-shot only when a tuple or policy change invalidates the current evidence
   cycle. Stabilize and bind the current policy to the current tuple before
   restarting; if the refreshed set is nonempty, use ordinary bounded
   30-second polling. Do not evaluate or classify any results from an
   invalidated cycle. Only after the closing tuple and full policy snapshot
   match their opening bindings may results be classified, using required
   contexts from only the selected SHA's current results.
4. Never combine results from different SHAs or different polling cycles. If
   candidate selection, an API request, or its pagination cannot be verified,
   stop and report the blocker. An unmatched Actions run or unverifiable event
   remains unavailable as described above.

Do not use `gh pr checks` or the PR rollup as the required-check gate because
those results may describe only the head. At the original 10-minute deadline,
if policy is unverified, unstable, or not bound to the current tuple, report
policy unknown and stop. Report CI as pending only when the current policy and
tuple are verified and required contexts remain pending; stop without claiming
readiness, even if a tuple or policy change triggered another polling cycle.
A verified empty policy may use its stable one-shot path. Do not use an
unbounded `--watch`. If both policy sources are verified and the set is empty,
perform one complete evidence cycle and skip only repeated waiting after
revalidating both policy sources even when the tuple is unchanged, comparing
the full policy snapshot and tuple with the bound policy, and validating the
closing tuple before classifying any results. If the closing tuple and full
policy snapshot match the opening binding and the set remains empty, the
current evidence cycle is complete: classify its results and do not repeat
the one-shot in this stable case. Repeat an empty-policy one-shot only when a
tuple or policy change invalidates the current evidence cycle. Stabilize and
bind the current policy to the current tuple before restarting.
An empty set skips waiting only when policy and tuple remain current. If the
tuple changes during policy revalidation, discard both responses and stabilize
both sources again within the same deadline. Bind the current policy to the
stable tuple before retrieving evidence. If any tuple member changes during
the one-shot evidence cycle, discard its results and restart policy
revalidation within the same deadline; if any tuple or policy change
invalidates the cycle, stabilize and bind the current policy to the current
tuple before restarting. If the refreshed policy is still empty, repeat a
fresh one-shot cycle; if it is nonempty, enter ordinary 30-second polling.
Never classify stale results as optional or ready. A recognized no-checks
response does not by itself mean either an empty policy or an API failure;
authentication, access, and other command errors remain blockers.

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

### Blocked merge-state exits

Merge state is a separate readiness requirement from CI and feedback:

| State | Bounded handling |
|---|---|
| `BLOCKED` | Inspect the current PR state, review requirements, and required-check evidence once. If the sole unmet requirement is an already-requested Copilot review that Phase 5 can process, continue through the normal Phase 4 feedback-routing gate and Phase 5's bounded wait; do not report ready while the state remains blocked. For a human-only approval, another unmet requirement, or an unknown cause, report the blocker and stop. Never dismiss reviews, bypass rules, or treat a green CI rollup as sufficient. |
| `DIRTY` | Report the merge conflict and stop. Conflict resolution, branch updates, rebasing, or force-pushing require their own authorization and must follow repository guidance. |
| `BEHIND` with any strict/up-to-date requirement true or unknown | Report that the base is ahead and identify the unverified/strict requirement. Stop without updating the branch, rebasing, force-pushing, or bypassing the rule unless separately authorized. |
| `UNKNOWN`, missing, or unrecognized state | Take one fresh PR-state read and verify the head/base tuple is unchanged. If the state is still unknown, missing, or unrecognized, report unavailable merge-state evidence and stop. It never establishes readiness. |
| Any other non-eligible state | Report the observed state and stop; do not infer a remediation or permission from it. |

These are terminal lifecycle exits until the user supplies any required
authorization or the underlying state changes. Never retry indefinitely,
automatically approve human-only blockers, or claim readiness from incomplete
merge-state evidence.

Take a fresh state snapshot before fixing feedback and after every push. These
are separate refresh points; a push invalidates earlier CI and review evidence.
Record the PR state (open, closed, or merged), current head SHA, review-thread
state, CI rollup, and merge state.
Use the selected SHA for required checks; it is the revision that governs them.
Use the head SHA for review coverage. Do not report a clean state from stale
checks or review data.
After a head change, earlier CI and review coverage is stale; repeat the
relevant checks for the new head. The older review cannot count as new-head
coverage. Complete the Phase 5 wait for that head once; do not restart it just
because earlier reviews remain. Revalidate any earlier findings against the
current diff.

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

## Existing-draft transition snapshots

This transition gate applies only to an existing draft and is distinct from
Phase 7's readiness snapshots. Keep the PR in draft while required checks or
feedback gates remain. After Phase 4 checks pass, retrieve and classify all
feedback through Phase 6 before the review wait; address actionable feedback
only through its safeguards, rerunning checks and feedback retrieval after
each push. Do not mark the PR ready just to trigger required checks that cannot
pass while it is a draft.

Once checks pass and feedback processing leaves no actionable finding,
unresolved clarification, or required permitted reply, mark the PR ready only
when the user or repository guidance authorizes that transition. Immediately
before a permitted transition, take two consecutive complete snapshots. In
each, record opening PR state, title, head/base SHAs, base name, merge state,
and the complete reviewer-request set using the endpoint and validation
defined in Phase 5. Retrieve complete PR state with this command for each
opening, closing, and final read:

```bash
gh pr view <number> --repo <owner>/<repo> --json state,isDraft,title,headRefOid,baseRefOid,baseRefName,mergeStateStatus
```

Retrieve policy/check evidence and all Phase 6 feedback surfaces, then repeat
both retrievals. Finish with fresh PR and reviewer-request reads after the last
feedback page. Retrieve and classify all feedback surfaces again after those
closing reads, then retrieve policy/check evidence once more. Finish with one
final PR-state and reviewer-request read after those final evidence reads.
Compare opening, closing, and final PR/reviewer values and all repeated
policy/check and feedback evidence within and across snapshots. Any mismatch
invalidates the transition; return to Phase 4 and the applicable feedback
handling. Require the PR to remain open and a draft, the head/base/base-name
tuple to match Phase 4, all required checks to pass, the reviewer-request
sets to remain unchanged, and the feedback sets to match the fully processed
set with no new actionable finding, unresolved clarification, or required
permitted reply. If these conditions hold and the current title passes § Title
format, run:

```bash
gh pr ready <number> --repo <owner>/<repo>
```

If transition authority is absent, report the draft blocker and stop. After a
transition, discard all earlier readiness evidence and restart Phases 4–6 for
the current PR state; this path never creates or retitles the PR. Do not wait
for Copilot review or enter Phase 7 while the PR remains a draft.

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
