# Repository layout

This repository is a multi-package APM producer monorepo.

## Top-level structure

```text
agent-packages/
  README.md
  docs/
  packages/
```

## Package structure

Each package uses the same pattern:

```text
packages/<package-name>/
  apm.yml
  .apm/
    agents/
    skills/
    instructions/   # optional
    prompts/        # optional
    hooks/          # optional
```

### Primitive paths

`.apm` is the canonical primitive root used by APM package discovery and editing.
The coordinator package omits the legacy `apm -> .apm` development alias because
APM 0.32.0 rejects that directory symlink when preparing Git dependencies.

## Packaging model

- Package boundaries are explicit and independent.
- Consumers install package subpaths, not the entire repository.
- `agent-defaults` is the canonical skills-only common package.
- Coordinator retains frozen skill snapshots for existing consumers. These
  intentional compatibility copies do not receive future shared-skill changes.

## Security and sharing expectations

- This repo is for shareable/community-safe content.
- Internal/private assets should remain in private repositories and must not be added here.
