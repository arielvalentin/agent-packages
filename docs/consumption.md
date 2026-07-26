# Consumption guide

Consumers can install one package or combine multiple packages from this monorepo.

## Install a single package

```yaml
dependencies:
  apm:
    - arielvalentin/agent-packages/packages/code-reviewers#v0.1.0
```

## Install multiple packages

```yaml
dependencies:
  apm:
    - arielvalentin/agent-packages/packages/coordinator#v0.1.0
    - arielvalentin/agent-packages/packages/development-workflow#v0.1.0
    - arielvalentin/agent-packages/packages/code-reviewers#v0.1.0
```

## Install command

```bash
apm install
```

## Pinning guidance

- Prefer tagged refs (`#vX.Y.Z`) for reproducibility.
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
