# agent-packages

Monorepo of reusable APM packages for custom Copilot agents and skills.

## Packages

- `packages/coordinator-pack`
  - Agent: `coordinator`
  - Skills: `acting-on-behalf`, `consensus-panel`, `handoff-envelope`
- `packages/build-pack`
  - Agents: `system-architect`, `implementer`
- `packages/performance-pack`
  - Agent: `perf-reviewer`
  - Skill: `datadog-url-router`
- `packages/style-pack`
  - Agent: `style-reviewer`

## Install examples

```yaml
dependencies:
  apm:
    - your-org/agent-packages/packages/coordinator-pack#v1.0.0
    - your-org/agent-packages/packages/build-pack#v1.0.0
```
