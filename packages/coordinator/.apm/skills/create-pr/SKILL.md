---
name: create-pr
description: >
  Use whenever a task ends in a new pull request. Covers explicit requests
  and byproduct PRs where work naturally results in one.
---

# Create PR

Use this skill when opening a new pull request — whether the user explicitly
asked for one or the work naturally ends in a PR.

## Pre-flight checks

Before creating a PR:

1. Run `acting-on-behalf` to resolve the user identity and prepare the
   AI disclaimer.
2. Ensure all review gates have passed (or explicit user waivers recorded).
3. Verify the branch has commits ahead of base.

## PR creation

```bash
gh pr create --draft \
  --title "<type>(<scope>): <description>" \
  --body "<body>"
```

Always create in **draft mode** by default. Only mark ready-for-review when
all gates pass and the user explicitly approves.

## Template detection

Before writing the PR body:

1. Check for `.github/PULL_REQUEST_TEMPLATE.md` (single template).
2. Check for `.github/PULL_REQUEST_TEMPLATE/` directory (multiple templates).
3. If a template exists, follow its structure — keep headings, sections, and
   HTML comments. Do not remove or skip sections; write "N/A" if a section
   doesn't apply.
4. If no template exists, use the standard body format below.

## Standard PR body format

```markdown
## Intent

<Why this change exists — the problem or outcome it addresses.>

## Changes

<What changed and key decisions/tradeoffs made.>

## Testing

<How the change was validated — test commands run, results.>

## References

Closes #<issue-number>
<!-- ADR references when relevant -->

---
> 🤖 _This PR was drafted by an AI agent on behalf of @{username}._
```

## Title format

Use Conventional Commits: `<type>(<scope>): <description>`

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `ci`, `perf`

## After creation

1. Run `watch-ci` to monitor the initial CI run.
2. Note the PR number and URL in the handoff summary.

## Fallback

If the built-in `create_pull_request` tool is available, prefer it over
`gh pr create` for better UI integration. Fall back to `gh` CLI when the
tool is unavailable.
