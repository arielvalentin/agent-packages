# agent-packages

Reusable APM producer monorepo for custom agents and skills.

This repository ships individually installable APM packages. Some workflow
bundles require companions; see the
[package compatibility matrix](docs/package-catalog.md#package-compatibility).

## What is in this repository

| Package | Purpose | Includes |
| --- | --- | --- |
| `packages/agent-defaults` | Repository-first defaults for direct execution | [Repository instructions and shared skills](packages/agent-defaults/README.md#includes), no coordinator agent |
| `packages/coordinator` | **Deprecated coordinator agent**; compatibility and shared skills | Legacy `coordinator` agent + [reusable shared skills](packages/coordinator/README.md#includes) |
| `packages/development-workflow` | Optional design advice + implementation | `system-architect`, `implementer` agents |
| `packages/code-reviewers` | Performance + style reviewer workflow | `perf-reviewer`, `style-reviewer` agents + `datadog-url-router` skill |
| `packages/personal-agents` | Curated Awesome Copilot variants without model presets | [Three agents](packages/personal-agents/README.md#includes), MIT-licensed |

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
    - arielvalentin/agent-packages/packages/agent-defaults#<agent-defaults-tag>
    - arielvalentin/agent-packages/packages/development-workflow#<development-workflow-tag>
    - arielvalentin/agent-packages/packages/code-reviewers#<code-reviewers-tag>
```

Replace every tag placeholder with a compatible published package tag.
The development and review agents require an `agent-defaults` release that
includes `writing-voice`; `agent-defaults-v0.1.0` does not include it.
See [releases](https://github.com/arielvalentin/agent-packages/releases).

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

Behavioral suites use native [GitHub Copilot Evals](https://github.com/github/evals)
definitions in `packages/*/evals/`, executed by the pinned Vally CLI.
Evaluation runs require Copilot-compatible credentials and may consume Copilot
usage. Setup installs Node and project dependencies but does not run evaluations.

```bash
# One-time setup
script/setup

# Run tests
npm test                              # all package smoke suites
npm run test:full                     # all full behavioral suites
npm run test:defaults                  # full canonical shared skills suite
npm run test:defaults:smoke            # canonical shared skills smoke suite
npm run test:coordinator               # full coordinator suite
npm run test:coordinator:smoke         # coordinator smoke suite
npm run test:dev-workflow              # full development-workflow suite
npm run test:dev-workflow:smoke        # development-workflow smoke suite
npm run test:reviewers                 # full code-reviewers suite
npm run test:reviewers:smoke           # code-reviewers smoke suite
```

The smoke commands select stimuli tagged `suite: smoke`; commands without
`:smoke` run the full package suite. The migration map at
`docs/evaluations-migration-map.json` tracks each legacy case and its native
equivalent. The runner fails closed when any selected source row lacks a
faithful native mapping; it never silently skips such rows.

Dependencies are declared in `Brewfile`; `script/setup` is idempotent and safe
to re-run.

## License

Apache-2.0. See `LICENSE`. The copied agents in
[`packages/personal-agents`](packages/personal-agents/README.md) retain their
upstream MIT license and copyright notice.
