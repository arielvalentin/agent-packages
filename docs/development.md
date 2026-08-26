# Development guide

## Prerequisites

- APM installed (`apm --version`)
- Git configured for signed commits if you plan to publish changes

## Working with package contents

Use the visible `apm/` path while editing:

```bash
cd packages/coordinator
tree -a -l
```

Notes:

- `apm/` is a symlink to `.apm`.
- edits in either path affect the same files.

## Local validation

From an individual package directory:

```bash
apm install --target copilot
```

From a consumer test repository, point at a local path dependency if needed:

```yaml
dependencies:
  apm:
    - path: /absolute/path/to/agent-packages/packages/coordinator
```

Then run:

```bash
apm install
```

## Recommended change workflow

1. Edit primitives in one package.
2. Validate in a small consumer project.
3. Commit changes with a clear Conventional Commits message (see
   [AGENTS.md](../AGENTS.md#commit-authoring)) — unscoped by default;
   add a `(<scope>)` only when the package/area isn't obvious from the diff.
4. Tag and publish/release when stable.

## Troubleshooting

- Hidden directories not visible: use `ls -la` or `tree -a`.
- Symlink not followed by tree: use `tree -l`.
- Harness not auto-detected in consumer repo: pass `--target <harness>` or set `targets:` in consumer `apm.yml`.
