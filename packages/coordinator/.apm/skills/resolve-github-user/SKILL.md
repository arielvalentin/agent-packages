---
name: resolve-github-user
description: Use when you need to determine the current GitHub username for attribution, disclaimers, or identity-aware operations.
---

# Resolve GitHub User

Determines the authenticated GitHub username using the cheapest available
source. Use this skill before any operation that requires the user's handle
(disclaimers, attributions, @-mentions, commit trailers).

## Memoization

This skill resolves the username **once per session**. After the first
successful resolution, store the result in session state (e.g., a
`github_username` key). On subsequent invocations, return the cached value
immediately — do not re-run the resolution steps.

## Resolution strategy (in priority order)

If no cached value exists, try each source in order. Stop at the first
successful result.

### 1. Session context

Check if the runtime provides identity directly:

- Environment variable: `$GITHUB_USER`
- Repository ownership from `git remote get-url origin` (extract the owner)
- Workspace/session metadata if available

### 2. Local git config

```bash
git config user.name
```

This is often the GitHub username or close to it. Cross-reference with the
remote URL owner if needed.

### 3. GitHub CLI auth cache (no network)

```bash
gh auth status 2>&1 | grep -oP '(?<=Logged in to github.com account )\S+'
```

This reads the local credential store — no API call required.

### 4. GitHub API (last resort)

```bash
gh api user --jq '.login'
```

Only use this if all above sources fail. It requires network access and
counts against rate limits.

## Output

Return the resolved username as a plain string (no `@` prefix). The calling
skill or agent is responsible for formatting (e.g., prepending `@`).

## Error handling

If all sources fail:

1. Ask the user for their GitHub handle.
2. Cache the answer in session state for subsequent calls (same memoization
   key as above).
