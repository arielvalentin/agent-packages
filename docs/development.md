# Development guide

## Prerequisites

- APM installed (`apm --version`)
- Git configured for signed commits if you plan to publish changes

## Working with package contents

Use the canonical `.apm/` path while editing:

```bash
cd packages/agent-defaults
tree -a .apm
```

## Local validation

Promptfoo smoke tests run by default with `npm test`. They cover a small set of
package-specific core behaviors and safety boundaries. Run the full behavioral
suite when changing behavior or investigating a failure:

```bash
npm run test:full
```

For one package, use its existing full-suite command (for example,
`npm run test:defaults`) or the corresponding `:smoke` command
(`npm run test:defaults:smoke`). The package eval workflows use the smoke suite
for affected packages on pull requests. Use the workflow's **Run workflow**
control and select `full` to run a package's complete suite in CI. To validate
an unmerged pull request, select its head branch in the workflow's ref
selector; the default branch will not include the pull request's changes.

Smoke runners reject empty selections and cases missing `suite: smoke`
metadata, both locally and in CI.

From an individual package directory:

```bash
apm install --target copilot
```

From a consumer test repository, point at a local path dependency if needed:

```yaml
dependencies:
  apm:
    - path: /absolute/path/to/agent-packages/packages/agent-defaults
```

Then run:

```bash
apm install
```

## Recommended change workflow

Shared-skill changes belong in `packages/agent-defaults`. Coordinator's skill
files are frozen compatibility snapshots and must not be edited for new policy.
`packages/coordinator/skill-snapshots.sha256` and the defaults check enforce
their frozen contents independently of the canonical defaults inventory.

1. Edit primitives in one package.
2. Validate in a small consumer project.
3. Commit changes with a clear Conventional Commits message (see
   [AGENTS.md](../AGENTS.md#commit-authoring)) — unscoped by default;
   add a `(<scope>)` only when the package/area isn't obvious from the diff.
4. Tag and publish/release when stable.

## Troubleshooting

- CI evals record the runtime versions, CPU architecture, and model digest.
  When an eval produces `eval.json`, it is retained for seven days as an
  `eval-<package>-<run>-<attempt>` artifact, including failed evaluations.
  Use the failing row's source, provider, rendered prompt, and output rather than
  its shared description alone. For local comparisons, use the locked npm
  dependencies and match the recorded Ollama version and model digest.
- Hidden directories not visible: use `ls -la` or `tree -a`.
- Harness not auto-detected in consumer repo: pass `--target <harness>` or set `targets:` in consumer `apm.yml`.
