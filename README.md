# agent-packages

Reusable APM producer monorepo for custom agents and skills.

This repository ships independent installable packages so consumers can pick only the workflow bundles they need.

## What is in this repository

| Package | Purpose | Includes |
| --- | --- | --- |
| `packages/coordinator` | Orchestration and gated review flow | `coordinator` agent + `acting-on-behalf`, `consensus-panel`, `handoff-envelope` skills |
| `packages/development-workflow` | Design + implementation workflow | `system-architect`, `implementer` agents |
| `packages/code-reviewers` | Performance + style reviewer workflow | `perf-reviewer`, `style-reviewer` agents + `datadog-url-router` skill |

## Repository layout

```text
agent-packages/
  packages/
    <package-name>/
      apm.yml
      .apm/            # canonical APM primitive root
      apm -> .apm      # convenience symlink for visible dev path
```

`apm/` symlinks to `.apm` so development can happen in a non-hidden path while APM still consumes the canonical `.apm` structure.

## Install and use

Add one or more packages to a consumer project:

```yaml
dependencies:
  apm:
    - arielvalentin/agent-packages/packages/coordinator#v0.1.0
    - arielvalentin/agent-packages/packages/development-workflow#v0.1.0
```

Then install:

```bash
apm install
```

## Documentation

- `docs/package-catalog.md` - package-by-package inventory
- `docs/repository-layout.md` - layout and design decisions
- `docs/development.md` - local development workflow
- `docs/consumption.md` - how consumers install subsets
- `docs/releasing.md` - tagging and release workflow

## Scope and policy notes

- This repo contains only shareable assets.
- Private/internal agents are intentionally excluded.
- Transitive marketplace dependencies are not copied here unless explicitly added to a package manifest.

## License

Apache-2.0. See `LICENSE`.
