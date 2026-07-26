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
  apm -> .apm
```

### Why both `.apm` and `apm`

- `.apm` is the canonical primitive root used by APM package discovery.
- `apm` is a symlink to `.apm` for developer ergonomics in tools that hide dot-directories.

## Packaging model

- Package boundaries are explicit and independent.
- Consumers install package subpaths, not the entire repository.
- Shared assets should be duplicated intentionally or factored into a dedicated common package if reuse grows.

## Security and sharing expectations

- This repo is for shareable/community-safe content.
- Internal/private assets should remain in private repositories and must not be added here.

