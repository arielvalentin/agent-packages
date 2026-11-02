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

### Affected local tests

Use the opt-in selector for routine local feedback:

```bash
npm run test:selector
npm run test:affected -- --dry-run
npm run test:affected
npm run test:affected -- --base main --no-cache
```

The selector unions staged, unstaged, and nonignored untracked paths. With
`--base <ref>`, it also includes committed changes since the merge-base with
that ref. It runs sequentially and does not change `npm test`, `test:full`,
or CI.

For each changed file, it selects smoke cases whose declared `file://` inputs
load that file, across all four configs. If there are no matching smoke cases,
it runs matching non-smoke cases instead. Variable arrays retain their normal
Promptfoo expansion. Selected runs require passing results and exactly the
expected description set.

A package test/config change selects that package's smoke suite. An uncovered
`.apm` file reports a coverage gap and falls back to its package's smoke suite.
Unsupported input forms also report a package-smoke fallback. Shared tooling,
unknown paths/packages, and an empty change set select all four smoke suites.
Explicit non-input exceptions are Markdown under `docs/`, root and package
`README.md`/`CHANGELOG.md`, and YAML workflow files under `.github/workflows/`.
These can select nothing, with an explicit message, unless they are declared
test inputs. `--dry-run` prints every path classification and the execution plan.

This is declared-input selection, not a coverage-adequacy check. Mentions of
other skills inside prose do not load their contents into an eval. Fallback
smoke runs do not establish coverage for an uncovered file. Keep using full
behavioral suites for behavior changes and existing static checks for package,
policy, and release contracts. CI remains unchanged; selector unit and offline
Promptfoo contract tests run separately through `test:selector`.

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
