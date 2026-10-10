# development-workflow

Design-and-implementation package for code and configuration changes.

## Includes

- Agents:
  - `system-architect`
  - `implementer`

## Use

Use this package when you want a structured path from design artifacts to implementation handoff.

## Required companion skills

Install `agent-defaults` alongside this package for `handoff-envelope`,
`pr-lifecycle`, and supporting safety/review skills:

```yaml
dependencies:
  apm:
    - arielvalentin/agent-packages/packages/agent-defaults#agent-defaults-v0.1.0
    - arielvalentin/agent-packages/packages/development-workflow#<development-workflow-tag>
```

Replace the placeholder with the published package tag containing direct-agent
support; see [releases](https://github.com/arielvalentin/agent-packages/releases).

Invoke the agents directly with user requirements or delegate with a handoff
envelope. No coordinator agent is required. When called directly, scope
questions and user gates return to the user.
