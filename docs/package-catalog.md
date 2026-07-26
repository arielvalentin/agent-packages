# Package catalog

This document is the authoritative inventory of installable packages in this repository.

## coordinator

- Path: `packages/coordinator`
- Manifest: `packages/coordinator/apm.yml`
- Purpose: orchestration and governance flow for delegated agent work
- Primitives:
  - Agent: `coordinator`
  - Skills:
    - `acting-on-behalf`
    - `consensus-panel`
    - `handoff-envelope`

## development-workflow

- Path: `packages/development-workflow`
- Manifest: `packages/development-workflow/apm.yml`
- Purpose: design-to-implementation workflow for code/config/script changes
- Primitives:
  - Agents:
    - `system-architect`
    - `implementer`

## code-reviewers

- Path: `packages/code-reviewers`
- Manifest: `packages/code-reviewers/apm.yml`
- Purpose: combined performance and style code-review workflow
- Primitives:
  - Agents:
    - `perf-reviewer`
    - `style-reviewer`
  - Skill:
    - `datadog-url-router`
