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

`pr-lifecycle` owns the lifecycle-wide stop decision. If any feedback chain is
`HUMAN_STOP`, stop the entire current PR lifecycle and return control to the
user, even if other chains are clean bot/app chains. This stricter lifecycle
rule takes precedence over `pr-feedback-review`'s per-chain handling when that
skill is invoked by this lifecycle. Do not process the clean chains in the same
iteration or dispatch fixes from them.

Only after complete thread retrieval, all relevant chains classify as
`AUTOMATION_FLOW`, and the caller's authorization gates pass may supported,
actionable findings enter `review-fix-loop`. Pass them as `accepted_findings`
with the reviewer (`adversarial-review`), exact diff scope, task/acceptance
context, and the unchanged caller-derived `explicit_multi_review` boolean.
The loop must not repeat its initial intake review for these already accepted
findings, but it must perform the required post-fix review. A Phase 5 review
alone never authorizes a change.

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
