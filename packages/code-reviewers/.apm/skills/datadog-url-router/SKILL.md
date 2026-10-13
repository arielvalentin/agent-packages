---
name: datadog-url-router
description: Route Datadog URLs/IDs to the correct dd-* skill and pup command.
---

# Datadog URL router

Use this skill when a prompt includes Datadog URLs, IDs, or asks about
Datadog logs/metrics/traces/audit/incidents.

Use `writing-voice` from `agent-defaults` for user-facing requests and
explanations. Preserve runnable commands and the fail-closed rules below.

## Fail-closed behavior

1. Do not use `WebFetch`, browser automation, or `curl` for Datadog app URLs.
2. Verify auth first with `pup auth status`.
3. If not authenticated, request `pup auth login`.
4. Never expose API/App keys in output.

## Routing

1. Extract URL type and object ID/query.
2. Load the matching `dd-*` skill (`dd-pup`, `dd-apm`, `dd-audit`, `dd-docs`).
3. Produce runnable `pup` commands (with window/org context where relevant).
4. Convert epoch timestamps from URLs via `date -r <epoch>` on macOS.

## Reference map

For full URL-pattern mappings and command examples, use:
`~/.dotfiles/copilot/references/datadog-url-map.md`.
