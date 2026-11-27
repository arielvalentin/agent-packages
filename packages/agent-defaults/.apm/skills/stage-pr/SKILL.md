---
name: stage-pr
description: >
  Spin up a preview environment for a PR so the user can manually validate
  behavior in a browser or terminal.
---

# Stage PR

Use this skill when the user asks to preview, stage, or validate a PR in
a running environment.

## When to use

Trigger phrases: "stage this PR", "spin up a preview", "launch a codespace
for this PR", "preview this PR", "give me a URL to test this", "I need to
validate this fix".

## Workflow

### 1. Check for existing preview infrastructure

Look for:
- Codespace dev container config (`.devcontainer/`)
- Preview deployment config (Vercel, Netlify, Render, etc.)
- Docker Compose or similar local setup

### 2. GitHub Codespace (preferred)

If the repo supports Codespaces, use GitHub tool routing from `acting-on-behalf`.
Verify the host and repository support Codespaces. Create one Codespace for
the bound repository and PR branch with a `basicLinux32gb` machine. Pass
the repository and ref as data, not as interpolated shell source.

Wait for creation, then read the forwarded ports for that exact Codespace
and report their URLs to the user.

### 3. Local preview (fallback)

If Codespaces aren't available:

1. Check out the PR branch locally.
2. Look for a dev server command (`npm run dev`, `make serve`, etc.).
3. Start it and report the local URL.

### 4. Report to user

Use `writing-voice` for the report, retaining the instructions needed to
validate and tear down the environment.

Provide:
- The preview URL (Codespace port or local)
- Instructions for what to validate
- How to tear down the environment when done

## Limitations

- If the repo has no dev container or preview infrastructure, report that
  staging is unavailable and suggest manual checkout.
- Codespace creation requires appropriate permissions and billing.

## Cleanup

Remind the user how to delete that Codespace when validation is complete.
