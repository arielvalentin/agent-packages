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

Use the pinned npm version for dependency and lockfile changes. Start with
compatible updates, not `npm audit fix --force`. Promptfoo 0.125.1 is the
latest direct release at the time these overrides were reviewed; it cannot
yet select all patched transitive dependencies itself.

The root `package.json` limits overrides to the consumers that need them:

| Consumer | Override | Compatibility and reason |
| --- | --- | --- |
| Promptfoo | `@modelcontextprotocol/server-filesystem` 1.0.0 | Replaces the deprecated date-based release. Keeps MCP SDK 1.x and the stdio entry point. The newer 2.x server requires Node 24, above this repository's Node 22 floor. |
| Promptfoo and filesystem server | `glob` 14.0.3, `minimatch` 11.0.4 | Fix cancellation bypass and globparts amplification. The consumers use `globSync`, `hasMagic`, `escape`, and `minimatch`, not the removed regexp APIs. Both versions support Node 22. Matching edge cases follow the upstream major-version fixes. |
| `get-uri` | `basic-ftp` 6.2.5 | Fixes directory-listing denial of service. Retains the Client methods used by `get-uri`. Version 6 denies separate transfer hosts by default to prevent FTP bounce attacks; unusual FTP servers relying on that behavior are no longer supported through this override. |

Review the upstream [glob changelog](https://github.com/isaacs/node-glob/blob/v14.0.3/changelog.md),
[minimatch changelog](https://github.com/isaacs/minimatch/blob/v11.0.4/changelog.md),
and [basic-ftp 6.0 change](https://github.com/patrickjuchli/basic-ftp/releases/tag/v6.0.0)
when refreshing or removing these pins. `npm run test:dependencies` checks file
discovery, scanner patterns, MCP tool calls and directory boundaries, FTP API
compatibility, and the script-dependent toolchain. It runs in structural CI and
before the default smoke suites.

npm 11 blocks dependency install scripts unless `allowScripts` approves them.
Only `esbuild@0.28.2` is approved: its postinstall locates, validates, and
prepares the platform binary needed by tsx. If the optional binary is absent,
the script can install or download that same version and verifies its hash.
Re-review the script before approving another version. `fsevents` is explicitly
denied: the registry package already includes its native macOS binding and
does not need an install-time build for this toolchain. Use
`npm install-scripts ls` to find new unreviewed scripts.

One upstream deprecation remains: `promptfoo` -> `gcp-metadata` -> `gaxios` ->
`node-fetch` -> `fetch-blob` -> `node-domexception@1.0.0`. Google provider
dependencies share that path. The latest gaxios and node-fetch releases still
depend on it. `node-domexception` 2.x is also deprecated and removes the default
export imported by fetch-blob, so overriding it is not compatible. Keep the
warning visible until upstream removes the shim; do not hide deprecations or
replace a package with a local stub.

### Behavioral tests

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

The evals use an Ollama `llama3.2:3b` provider as a regression proxy. They do
not establish parity with Copilot models or verify that every Copilot client
loads the same package resources.

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

- CI evals record runtime versions and CPU architecture, and verify the pinned
  Ollama model digest before evaluation.
  When an eval produces `eval.json`, it is retained for seven days as an
  `eval-<package>-<run>-<attempt>` artifact, including failed evaluations.
  Use the failing row's source, provider, rendered prompt, and output rather than
  its shared description alone. For local comparisons, use the locked npm
  dependencies and match the recorded Ollama version and model digest.
- Hidden directories not visible: use `ls -la` or `tree -a`.
- Harness not auto-detected in consumer repo: pass `--target <harness>` or set `targets:` in consumer `apm.yml`.
