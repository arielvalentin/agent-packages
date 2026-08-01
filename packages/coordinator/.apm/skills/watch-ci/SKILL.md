---
name: watch-ci
description: >
  Monitor GitHub Actions workflow runs and status checks on a PR or branch.
  Use after pushing commits to track CI to green or actionable failure.
---

# Watch CI

Monitor CI/CD pipeline status for a PR or branch and report results.

## When to use

Trigger phrases: "watch CI", "monitor checks", "alert when CI passes",
"watch build status", "let me know when it's green", "keep an eye on CI".

## Workflow

### 1. Identify the target

Determine what to watch:
- A PR number → `gh pr checks <number>`
- A branch → `gh run list --branch <branch> --limit 1`
- A specific run → `gh run view <run-id>`

### 2. Monitor checks

For PR checks (preferred):

```bash
gh pr checks <number> --watch --fail-fast
```

For workflow runs:

```bash
gh run watch <run-id>
```

### 3. Report results

**On success (all green)**:
- Report which checks passed
- Note total CI duration if available

**On failure**:
- Identify which check(s) failed
- Fetch failure logs:
  ```bash
  gh run view <run-id> --log-failed
  ```
- Categorize the failure: test error, lint, build, timeout, flaky
- Report actionable context for the fix

**On pending** (timeout):
- Report which checks are still running
- Suggest re-checking later

## Continuous monitoring

For the PR lifecycle loop, watch CI after every push:

1. Push fixes → run `watch-ci`
2. Report result to coordinator
3. If failed → provide failure context for `implementer` dispatch
4. If passed → proceed to next gate

## Fallback

If `gh pr checks --watch` is unavailable, poll manually:

```bash
# Poll every 30 seconds
while true; do
  gh pr checks <number> --json name,state,conclusion
  sleep 30
done
```
