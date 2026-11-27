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

### 3. Authenticated account (last resort)

Follow `acting-on-behalf`'s GitHub tool routing for the authenticated-user
lookup on the bound host. If the session exposes no MCP tool for this lookup,
`gh api --hostname <host> user` can read the authenticated account.
Accept the login only when `type` is `User` and the account is verified as
the requesting user's personal account, not a machine or service principal.
If the lookup fails or the account cannot be verified, ask the user for
their handle instead of inferring it from remote evidence.

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
