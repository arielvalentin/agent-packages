---
name: wait-for-copilot-code-review
description: >
  Wait for GitHub Copilot's automated code review to complete on a PR.
  Use in the PR lifecycle loop to capture automated review findings
  before declaring all reviews resolved.
---

# Wait for Copilot Code Review

Monitor a PR for Copilot's automated code review and report when it
completes.

## When to use

Trigger phrases: "watch for Copilot review", "wait for code review",
"let me know when Copilot finishes reviewing", "monitor Copilot review".

## Workflow

### 1. Check if Copilot review is expected

Not all repos have Copilot code review enabled. Check:

```bash
gh pr view <number> --json reviews --jq '.reviews[] | select(.author.login == "copilot-pull-request-reviewer" or .author.login == "github-actions[bot]")'
```

If the repo doesn't use automated Copilot review, skip this skill and
note it.

### 2. Poll for review completion

```bash
# Check for Copilot review status
gh pr view <number> --json reviews --jq '[.reviews[] | select(.author.login | test("copilot|github-actions"))] | length'
```

Poll every 30 seconds until a review from Copilot appears or a timeout
of 10 minutes is reached.

### 3. Read review findings

Once the review is posted:

```bash
gh api repos/{owner}/{repo}/pulls/<number>/reviews \
  --jq '[.[] | select(.user.login | test("copilot")) | {state: .state, body: .body}]'
```

Fetch inline comments:

```bash
gh api repos/{owner}/{repo}/pulls/<number>/comments \
  --jq '[.[] | select(.user.login | test("copilot")) | {path: .path, line: .line, body: .body}]'
```

### 4. Report results

- **No findings** → Copilot review passed, note in status.
- **Findings present** → Categorize by severity, report to coordinator
  for triage. Actionable findings should enter the `review-fix-loop`.
- **Timeout** → Report that Copilot review did not complete within the
  timeout window. Proceed without it but note the gap.

## Integration with PR lifecycle

In the PR lifecycle loop, run this skill **after** `watch-ci` passes and
**before** declaring "all reviews resolved":

1. CI green → run `wait-for-copilot-code-review`
2. Copilot review complete → check for human reviews
3. All reviews resolved → ready to merge
