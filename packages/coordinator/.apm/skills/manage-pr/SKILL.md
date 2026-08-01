---
name: manage-pr
description: >
  Use when iterating on an existing PR through the review/CI/merge loop.
  Covers addressing feedback, responding to comments, and driving to merge.
---

# Manage PR

Use this skill when driving an existing PR through its review and CI cycle.

## When to use

- User asks to "address PR feedback" or "respond to review comments"
- CI has failed and needs fixes pushed
- PR needs updates after reviewer comments
- User wants to iterate on a PR until it's clean

## Workflow

### 1. Read current PR state

```bash
gh pr view <number> --json title,body,state,reviews,comments,statusCheckRollup,labels,reviewRequests
```

### 2. Analyze review feedback

For each review comment:

- **Actionable feedback** — dispatch `implementer` to fix, push the commit,
  reply with `Fixed in <sha>` using `acting-on-behalf`.
- **Questions / clarifications** — reply with evidence, documentation, or
  rationale. Keep the thread open for the reviewer.
- **Disagreements** — reply with a clear rebuttal and supporting evidence.
  Do not resolve the thread; let the reviewer decide.

### 3. Push fixes

After addressing feedback:

```bash
git push
```

### 4. Update PR body (if needed)

If the changes alter the PR's intent or scope:

```bash
gh pr edit <number> --body "<updated body>"
```

### 5. Re-check CI

After any push, monitor CI:

```bash
gh pr checks <number> --watch
```

### 6. Request re-review

If substantive changes were made:

```bash
gh pr edit <number> --add-reviewer <reviewer>
```

## Comment replies

All replies must:

1. Include the AI disclaimer via `acting-on-behalf`.
2. Reference the fixing commit SHA when applicable: `Fixed in <sha>`.
3. Be posted with `gh pr comment` or `gh pr review --comment`.

## Fallback

If built-in PR management tools are available, prefer them for better UI
integration. Fall back to `gh` CLI when unavailable.
