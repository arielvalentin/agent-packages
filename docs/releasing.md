# Releasing guide

This repository is versioned by git tags. Consumers are expected to pin tags in their dependencies.

## Release checklist

1. Ensure package docs and manifests are current.
2. Validate package install flow in a test consumer.
3. Open and merge a reviewed PR with Conventional Commits. Never push directly
   to `main`.
4. Wait for Release Please to open its release PR.
5. Review the generated changelogs, package versions, and release manifest,
   then merge the release PR.
6. Verify the package-specific GitHub releases and tag SHAs.

## Tagging

Release Please uses `release-please-config.json` and
`.release-please-manifest.json` to version each actively released package.
The `simple` release strategy updates `version.txt`, and the YAML extra-file
updater keeps `apm.yml` synchronized. A new package starts at `0.0.0` locally
and requests an initial `0.1.0` release; do not use a breaking `!` commit to
bootstrap it.

Tags are package-specific, such as `agent-defaults-v0.1.0`. Consumers pin the
exact published tag or commit SHA. Do not invent repository-wide tags or bypass
Release Please.

## Coordinator deprecation rollout

The final deprecation release,
[`coordinator-v0.14.0`](https://github.com/arielvalentin/agent-packages/releases/tag/coordinator-v0.14.0),
was published before the package was removed from current `main`. The tag and
its historical contents remain unchanged. Current `main` no longer contains
the package or configures it for ongoing releases.

`agent-defaults` owns current shared-skill releases. The coordinator's
historical package contents remain available only through its published refs.

## Package-specific release notes

Because this is a monorepo, include package names in release notes:

- changed packages
- breaking/non-breaking notes
- migration guidance if needed

## Compatibility policy

- Patch (`x.y.Z`): bug fixes and docs updates
- Minor (`x.Y.z`): backward-compatible package improvements
- Major (`X.y.z`): breaking changes in prompts/instructions/contracts
