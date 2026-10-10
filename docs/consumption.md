# Consumption guide

Consumers can install one package or combine multiple packages from this monorepo.

## Install a single package

```yaml
dependencies:
  apm:
    - arielvalentin/agent-packages/packages/agent-defaults#agent-defaults-v0.1.0
```

## Install multiple packages

```yaml
dependencies:
  apm:
    - arielvalentin/agent-packages/packages/agent-defaults#agent-defaults-v0.1.0
    - arielvalentin/agent-packages/packages/development-workflow#<development-workflow-tag>
    - arielvalentin/agent-packages/packages/code-reviewers#<code-reviewers-tag>
```

Replace the downstream placeholders with published package tags that include
direct-agent support; see [releases](https://github.com/arielvalentin/agent-packages/releases).

## Deprecated coordinator package

The coordinator agent is deprecated. Prefer direct agent execution and remove
mandatory coordinator routing from consumer instructions. Existing consumers
can keep using the agent; the package remains installable, and its bundled
shared skills are not deprecated.

Replace the coordinator dependency with `agent-defaults`. It is the canonical,
skills-only package; the legacy coordinator retains frozen skill snapshots for
compatibility. `development-workflow` uses
`handoff-envelope` and `pr-lifecycle`, and `code-reviewers` uses
`handoff-envelope` and `consensus-panel`. All supporting shared skills are
included in `agent-defaults`; see its [migration guidance](../packages/agent-defaults/README.md#migration-from-coordinator).
Preserve existing public-interaction gates and caller-owned review handoffs.
Do not install both packages unless you need the legacy agent, because their
skill names overlap. Remove duplicate standalone dependencies such as
`stage-pr` when intentionally choosing the defaults package's skill version.

## Install command

```bash
apm install
```

## Pinning guidance

- Prefer package-specific tagged refs (`#agent-defaults-vX.Y.Z`, for example)
  for reproducibility.
- Use commit SHAs only when necessary.
- Avoid floating refs in production/shared environments.

## Target guidance

If the consumer repo does not have harness markers, set target explicitly:

```bash
apm install --target copilot
```

or in consumer `apm.yml`:

```yaml
targets:
  - copilot
```
