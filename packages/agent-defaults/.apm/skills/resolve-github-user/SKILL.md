---
name: resolve-github-user
description: Use when you need to determine the current GitHub username for attribution or identity-aware operations.
---

# Resolve GitHub User

Determines the authenticated GitHub username using the cheapest available
source. Use this skill before any operation that requires the user's handle
(attributions, @-mentions, commit trailers).

The `acting-on-behalf` disclaimer needs no identity lookup.

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
gh config get -h github.com user
```

This reads the local `gh` host configuration — no API call required. Do not
substitute `gh auth status`; it contacts GitHub to validate the token. It is local
state, like `git config`, so the GitHub tool routing in `acting-on-behalf`
does not apply. That routing governs the API lookup in step 4.

### 4. GitHub API (last resort)

Use the GitHub MCP authenticated-user tool first. Accept its login only when it
is the requesting user's personal account, not an app, bot, or service
principal. If the tool is unavailable, returns a fallback-eligible operational
error under `acting-on-behalf` § GitHub tool routing, or returns another or
unverified principal, fall back to:

```bash
gh api user --jq '"\(.login) \(.type)"'
```

Apply the same personal-account check to the fallback result. Accept it only
when `type` is `User` and nothing indicates a machine or service account.
Return only the login. If neither route
returns a verified personal account for the requesting user, ask the user
instead of caching a login.

Only use this if all above sources fail. It requires network access and
counts against rate limits.

## Output

Return the resolved username as a plain string (no `@` prefix). The calling
skill or agent is responsible for formatting (e.g., prepending `@`).

## Error handling

If all sources fail:

Use `writing-voice` for the user-facing question, without changing the plain
username output contract.

1. Ask the user for their GitHub handle.
2. Cache the answer in session state for subsequent calls (same memoization
   key as above).
