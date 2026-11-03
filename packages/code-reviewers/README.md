# code-reviewers

Code review package focused on static performance/scalability and style/idioms.

## Includes

- Agents:
  - `perf-reviewer`
  - `style-reviewer`
- Skill:
  - `datadog-url-router`

## Use

Use this package when you want both static performance/scalability review and idiomatic/style review, with standardized Datadog URL routing guidance.

## Required companion skills

Install `agent-defaults` alongside this package for `handoff-envelope`,
`consensus-panel`, `writing-voice`, and supporting safety/review skills:

```yaml
dependencies:
  apm:
    - arielvalentin/agent-packages/packages/agent-defaults#<agent-defaults-tag>
    - arielvalentin/agent-packages/packages/code-reviewers#<code-reviewers-tag>
```

Replace both placeholders with compatible published package tags. Select an
`agent-defaults` release containing `writing-voice`, not `agent-defaults-v0.1.0`;
see [releases](https://github.com/arielvalentin/agent-packages/releases).

Invoke reviewers directly with a diff, files, or code to review, or delegate
with a validated review handoff. No coordinator agent or implementation-summary
artifact is required for direct invocation. Reviewers preserve the shared JSON
verdict contract and do not run live profiles.

## Datadog routing

`datadog-url-router` includes its own `references/url-map.md`; APM deploys the
complete skill directory. Datadog MCP is the primary route for account data.
`pup` is used only when an MCP request remains rate-limited after one retry, and
only for that operation after checking `pup auth status`, loading `dd-pup` as
the CLI helper, and verifying the installed CLI syntax. Install `dd-docs` for
public Datadog documentation; no other MCP failure permits a `pup` fallback.
The user performs any login required for the CLI fallback.
