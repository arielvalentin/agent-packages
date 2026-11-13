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
supports deterministic validation of the native eval definitions and migration
map. `npm run test:dependencies` checks the pinned tool, strict Vally schema
validation, migration-map completeness, and result-validator regressions.

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
and may consume Copilot usage. Run the full behavioral suite when changing
behavior or investigating a failure:

```bash
npm run test:full
```

For one package, use its full-suite command (for example,
`npm run test:defaults`) or corresponding `:smoke` command
(`npm run test:defaults:smoke`). Credentialed GitHub Actions evaluations run
only on pushes to `main` or manual dispatches on `main`. They use the built-in
GitHub Actions token with `copilot-requests: write`, unless the optional
`COPILOT_GITHUB_TOKEN` secret overrides it. The built-in token's use requires
the repository owner's Copilot entitlement and may consume usage. Evaluations
run only when both the original actor and the actor triggering a rerun are the
repository owner. Pull-request CI runs offline validation instead. These guards
rely on trusting repository writers, who can modify workflow definitions.

The runner validates the source-to-native map before starting Copilot. It
rejects empty selections, missing or duplicate stimuli, and every source row
that does not have a native mapping. The migration map accounts for all 478
source rows: 438 in agent-defaults, 4 in coordinator, 20 in
development-workflow, and 16 in code-reviewers. None are omitted.

Thirty-one rows exercise root policy behavior. Their unchanged source
profiles, instructions, or reference files are staged at supported workspace
instruction paths: `.github/copilot-instructions.md` and, when a second file
is needed, `AGENTS.md`. Vally 0.19.0 enables Copilot SDK configuration
discovery, and the SDK loads custom instructions by default. These rows test
the policy text in a root agent context; they do not certify custom-agent
discovery, profile registration, or profile-specific tool restrictions.
The three pr-lifecycle reference files that the source prompt conditionally
included are still embedded verbatim and in order in each native lifecycle
stimulus. Shell command execution is blocked by Vally's supported tool
simulation because the source evaluations used a text-only provider; this
keeps the Copilot credential out of agent-launched shell commands.

The two approved diagnostics are retained as native stimuli. Only their
assertion failures are non-blocking; execution or grader errors, malformed or
missing results, duplicate results, skill-invocation failures, and all other
failed graders remain blocking. All four package suites pass offline mapping
and strict-schema preflight. Those deterministic checks do not prove model
behavior; credentialed runs use Copilot and may consume usage.

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
