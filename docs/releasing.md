# Releasing guide

This repository is versioned by git tags. Consumers are expected to pin tags in their dependencies.

## Release checklist

1. Ensure package docs and manifests are current.
2. Validate package install flow in a test consumer.
3. Commit changes to `main`.
4. Create a tag.
5. Push tag.
6. Announce release notes.

## Tagging

Simple repository-wide release tag:

```bash
git tag -s v0.1.0 -m "Release v0.1.0"
git push origin v0.1.0
```

## Package-specific release notes

Because this is a monorepo, include package names in release notes:

- changed packages
- breaking/non-breaking notes
- migration guidance if needed

## Compatibility policy suggestion

- Patch (`x.y.Z`): bug fixes and docs updates
- Minor (`x.Y.z`): backward-compatible package improvements
- Major (`X.y.z`): breaking changes in prompts/instructions/contracts

