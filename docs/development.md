# Development guide

## Prerequisites

- APM installed (`apm --version`)
- Git configured for signed commits if you plan to publish changes

CI pins APM to v0.35.0 and prints the installed version in its logs.

## Working with package contents

Use the canonical `.apm/` path while editing:

```bash
cd packages/agent-defaults
tree -a .apm
```

## Local validation

Run `script/setup` once to install the npm version pinned in `package.json`
under `devEngines.packageManager`. Setup and both CI install paths read that
pin. npm versions that support `devEngines` reject dependency and test commands
when the configured npm version does not match.

The Node 26 path selection in `script/setup` applies only while setup runs. To
use that runtime in the current shell for later npm commands, run:

```bash
export PATH="$(brew --prefix node@26)/bin:$PATH"
```

To update npm without running the rest of setup, first apply that PATH setting:

```bash
npm install --global "npm@$(node -p "require('./package.json').devEngines.packageManager.version")"
```

Before pushing, start local validation with a clean dependency install:

```bash
npm ci
```

This checks that the committed lockfile is installable with the same npm
version used in CI. It runs manually, not through an automatic Git hook.

### Dependency hygiene

Use the pinned npm version for dependency and lockfile changes. The active
evaluation runtime is the repository-pinned `@microsoft/vally-cli`; `js-yaml`
supports deterministic validation of the native eval definitions.
`npm run test:dependencies` checks the pinned tool, strict Vally schema
validation, and result-validator regressions.

npm 11 blocks dependency install scripts unless `allowScripts` approves them.
Only `esbuild@0.28.2` is approved: its postinstall locates, validates, and
prepares the platform binary needed by tsx. If the optional binary is absent,
the script can install or download that same version and verifies its hash.
Re-review the script before approving another version. `fsevents` is explicitly
denied: the registry package already includes its native macOS binding and
does not need an install-time build for this toolchain. Use
`npm install-scripts ls` to find new unreviewed scripts.

### Behavioral tests

Native Vally smoke tests run by default with `npm test`. They require a
Copilot-compatible token (`COPILOT_GITHUB_TOKEN`, `GH_TOKEN`, or `GITHUB_TOKEN`)
and may consume Copilot usage. Set `VALLY_MODEL=gpt-5.3-codex` to match the
hosted evaluation model. Run the full behavioral suite when changing
behavior or investigating a failure:

```bash
VALLY_MODEL=gpt-5.3-codex npm run test:full
```

For one package, use the same environment setting with its full-suite command
(for example, `VALLY_MODEL=gpt-5.3-codex npm run test:defaults`) or
corresponding `:smoke` command (`npm run test:defaults:smoke`). Credentialed
GitHub Actions evaluations run
only on pushes to `main` or manual dispatches on `main`. They use the built-in
GitHub Actions token with `copilot-requests: write`, unless the optional
`COPILOT_GITHUB_TOKEN` secret overrides it. The built-in token's use requires
the repository owner's Copilot entitlement and may consume usage. Evaluations
run with `gpt-5.3-codex` and only when both the original actor and the actor
triggering a rerun are the repository owner. Pull-request CI runs offline
validation instead. These guards rely on trusting repository writers, who can
modify workflow definitions.

The runner validates native specs before starting Copilot. It rejects empty
selections, duplicate stimuli, and missing, duplicate, or unexpected results.
The original Promptfoo migration snapshot remains available in
[Git history](https://github.com/arielvalentin/agent-packages/blob/f85609e7966e4f8d2e80c909d0f96556e1dfe050/docs/evaluations-migration-map.json).

Thirty-one stimuli exercise root policy behavior. Their
profiles, instructions, or reference files are staged at supported workspace
instruction paths: `.github/copilot-instructions.md` and, when a second file
is needed, `AGENTS.md`. Vally 0.19.0 enables Copilot SDK configuration
discovery, and the SDK loads custom instructions by default. These rows test
the policy text in a root agent context; they do not certify custom-agent
discovery, profile registration, or profile-specific tool restrictions.
Native staged files must be APM policy documents or managed fixtures and must
target `.github/copilot-instructions.md`. Combined fixtures are checked against
the ordered canonical policy paths in `script/native-eval-fixtures.json`.
Shell command execution is blocked by
Vally's supported tool simulation; this
keeps the Copilot credential out of agent-launched shell commands.
The clone-notice case also stops after one model iteration.

The eight approved diagnostics are retained as native stimuli. Only their
assertion failures are non-blocking; execution or grader errors, malformed or
missing results, duplicate results, skill-invocation failures, and all other
failed graders remain blocking. Offline preflight and strict-schema lint
do not prove model
behavior; credentialed runs use Copilot and may consume usage.

### Affected local tests

Use the opt-in selector for routine local feedback:

```bash
npm run test:selector
npm run test:affected -- --dry-run
npm run test:affected
npm run test:affected -- --base main
```

The selector unions staged, unstaged, and nonignored untracked paths. With
`--base <ref>`, it also includes committed changes since the merge-base with
that ref. It runs sequentially and does not change `npm test`, `test:full`,
or CI.

The selector validates native specs before planning runs. It matches changed
files against staged files, canonical fixture composition sources, and Vally
`agent_environment.skills` inputs. For each changed file, it selects matching smoke stimuli across all
packages; when none match, it selects the matching full-suite stimuli.
Unused legacy provider defaults are not inputs: each lifecycle reference now
selects 155 agent-defaults smoke cases rather than 263, and the repository-access
skill selects 23 rather than 24 cases.

Changes under a package's `tests/` or `evals/` directory also select that
package's smoke suite. The selector still checks all packages for declared
inputs before continuing, so a test fixture change can select both its owning
package's smoke cases and cross-package cases that load the fixture. A changed
`.apm` file with no declared match reports a coverage gap and selects the
owning package's smoke suite; this fallback does not establish coverage for
that file. Shared tooling, unknown paths, and an empty change set select all
four smoke suites.

Markdown under `docs/`, root and package `README.md`/`CHANGELOG.md`, and YAML
workflow files under `.github/workflows/` are explicit non-input exceptions.
They can select nothing unless a native stimulus declares the changed file as
an input. `--dry-run` prints each path classification and the execution plan.
Selected runs validate the exact stimulus result inventory; approved
diagnostic assertion failures remain visible and non-blocking, while execution,
grader, malformed-result, missing-result, and other failed-result errors block.

This is declared-input selection, not a coverage-adequacy check. Keep using
full behavioral suites for behavior changes and existing static checks for
package, policy, and release contracts. Smoke fallbacks do not claim full
coverage. CI remains unchanged; selector and native runner selection contracts
run offline through `test:selector`.

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

- CI records runtime versions and CPU architecture. Vally JSONL results and
  run artifacts are retained for seven days, including failed evaluations.
  Use the stimulus identity, grader evidence, and execution status to diagnose
  a failure. The runner requires complete mapped case coverage and Copilot
  credentials; it does not fall back to a local model.
- Hidden directories not visible: use `ls -la` or `tree -a`.
- Harness not auto-detected in consumer repo: pass `--target <harness>` or set `targets:` in consumer `apm.yml`.
