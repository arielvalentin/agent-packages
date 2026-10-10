# agent-packages

Reusable APM producer monorepo for custom agents and skills.

This repository ships independent installable packages so consumers can pick only the workflow bundles they need.

## What is in this repository

| Package | Purpose | Includes |
| --- | --- | --- |
| `packages/agent-defaults` | Shared skills for direct agent execution | [12 reusable skills](packages/agent-defaults/README.md#includes), no coordinator agent |
| `packages/coordinator` | **Deprecated coordinator agent**; compatibility and shared skills | Legacy `coordinator` agent + [reusable shared skills](packages/coordinator/README.md#includes) |
| `packages/development-workflow` | Design + implementation workflow | `system-architect`, `implementer` agents |
| `packages/code-reviewers` | Performance + style reviewer workflow | `perf-reviewer`, `style-reviewer` agents + `datadog-url-router` skill |

## Repository layout

```text
agent-packages/
  packages/
    <package-name>/
      apm.yml
      .apm/            # canonical APM primitive root
```

## Install and use

Add one or more packages to a consumer project:

Prefer direct agent execution over mandatory coordinator routing. The
coordinator package remains available for existing consumers. Shared skills
are not deprecated: install `agent-defaults` alongside the development and
review agents that reference them.

```yaml
dependencies:
  apm:
    - arielvalentin/agent-packages/packages/agent-defaults#agent-defaults-v0.1.0
    - arielvalentin/agent-packages/packages/development-workflow#<development-workflow-tag>
    - arielvalentin/agent-packages/packages/code-reviewers#<code-reviewers-tag>
```

Replace the downstream tag placeholders with their published package tags
that include direct-agent support. See [releases](https://github.com/arielvalentin/agent-packages/releases).

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

## Running behavioral tests locally

Tests use [promptfoo](https://promptfoo.dev) + [Ollama](https://ollama.com) (local LLM, no API keys needed).

```bash
# One-time setup (installs Ollama, Node, npm deps, pulls model)
script/setup

# Run tests
npm test                     # all packages
npm run test:defaults        # canonical shared skills
npm run test:coordinator     # single package
npm run test:reviewers
npm run test:dev-workflow
```

Dependencies are declared in `Brewfile` — `script/setup` is idempotent and safe to re-run.

> **Note:** CI uses a pinned Ollama binary with SHA256 verification for supply chain safety.
> Locally, the Homebrew-managed version is fine.

## License

Apache-2.0. See `LICENSE`.
