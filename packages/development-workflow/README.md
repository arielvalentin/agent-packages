# development-workflow

Design-and-implementation package for code and configuration changes.

## Includes

- Agents:
  - `system-architect`
  - `implementer`

## Use

Use the implementer directly for an accepted task. System Architect is an
optional specialist for requested architecture advice or explicitly delegated
consequential design decisions, not a required step before implementation.
Small questions get inline answers without a design file, plan-approval step,
follow-up ritual or another agent hop.

Create a design artifact only when requested, relevant to a consequential
decision, or needed downstream. Use relevant sections rather than a fixed
eleven-section template. Consequential designs still cover realistic failures
and mitigations, plus rollout/migration/recovery risks where applicable. Ask
when genuinely missing requirements block a sound decision, not merely because
there is no prior artifact.

## Required companion skills

Install `agent-defaults` alongside this package for `handoff-envelope`,
`pr-lifecycle`, `writing-voice`, and supporting safety/review skills:

```yaml
dependencies:
  apm:
    - arielvalentin/agent-packages/packages/agent-defaults#<agent-defaults-tag>
    - arielvalentin/agent-packages/packages/development-workflow#<development-workflow-tag>
```

Replace both placeholders with compatible published package tags. Select an
`agent-defaults` release containing `writing-voice`, not `agent-defaults-v0.1.0`;
see [releases](https://github.com/arielvalentin/agent-packages/releases).

Invoke the agents directly with user requirements or delegate with a handoff
envelope. No coordinator agent is required. When called directly, scope
questions and user gates return to the user.

The implementer follows `pr-lifecycle` for PR creation timing, title validation,
and templates instead of duplicating its policy. Repository-required title
formats override the generic Conventional Commits default; safety gates remain
in force.
