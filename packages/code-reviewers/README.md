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
`consensus-panel`, and supporting safety/review skills:

```yaml
dependencies:
  apm:
    - arielvalentin/agent-packages/packages/agent-defaults#agent-defaults-v0.1.0
    - arielvalentin/agent-packages/packages/code-reviewers#<code-reviewers-tag>
```

Replace the placeholder with the published package tag containing direct-agent
support; see [releases](https://github.com/arielvalentin/agent-packages/releases).

Invoke reviewers directly with a diff, files, or code to review, or delegate
with a validated review handoff. No coordinator agent or implementation-summary
artifact is required for direct invocation. Reviewers preserve the shared JSON
verdict contract and do not run live profiles.
