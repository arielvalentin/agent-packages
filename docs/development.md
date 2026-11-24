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

Eval definitions use Vally's built-in graders; no project grader plugin is
required. Native output matchers cover token polarity, conflicting answers,
and output-length limits. Converted one-token cases require the complete answer
to be that token, with optional Markdown emphasis, rather than parsing prose
selection labels or explanations. The draft-PR command case tests a fixed, explicit
repository and command format, not arbitrary CLI option spellings or dynamic
repository expressions. Regex checks do not establish semantic correctness.

npm 11 blocks dependency install scripts unless `allowScripts` approves them.
Only `esbuild@0.28.2` is approved: its postinstall locates, validates, and
prepares the platform binary needed by tsx. If the optional binary is absent,
the script can install or download that same version and verifies its hash.
Re-review the script before approving another version. `fsevents` is explicitly
denied: the registry package already includes its native macOS binding and
does not need an install-time build for this toolchain. Use
`npm install-scripts ls` to find new unreviewed scripts.

### Behavioral evaluations

`npm test` runs only offline dependency, native-eval, grader, and workflow
contract checks. It does not start model evaluations, require a Copilot token,
or consume Copilot usage. Use the credentialed GitHub Actions workflows for
behavioral evaluations. They run smoke suites on pushes to `main` and eligible
same-repository owner pull requests. Manual dispatch on `main` supports smoke
or full suites. Both the original actor and the actor triggering a rerun must
be the repository owner. Fork pull requests never run credentialed evaluations.

Same-repository Dependabot pull requests run lint only on a GitHub-hosted
runner with npm installation scripts disabled and no Copilot permission or
secret. The action job is **not credential-free**: it has a read-only GitHub
Actions token. It does not run or report credentialed evals.

After a successful eligible lint, a separate default-branch workflow checks
the source run, lint job, and an open same-repository Dependabot PR at the
same head SHA through the GitHub API. It dispatches only the corresponding
smoke workflow on `main`, without forwarding PR code or artifacts. The
credentialed baseline uses trusted `main` code and actions. **It does not
test the updated action paired with the evals.** The baseline is not a PR
report or a merge gate. Dispatches are limited to one run and worker, no
retries, and a cancelling concurrency group per workflow.

The credentialed workflows use the built-in GitHub Actions token with
`copilot-requests: write`. For owner runs, the optional `COPILOT_GITHUB_TOKEN`
secret overrides it. The Dependabot baseline always uses the built-in token.
The built-in token requires the repository owner's Copilot
entitlement, and evaluations may consume usage. Evaluations use
`gpt-5.3-codex`. Only the owner PR report job has pull-request write permission.
The dispatcher has Actions write and read access to contents and pull requests,
but no Copilot permission. It does not trust the run's `pull_requests` array.
Live dispatch actor identity, token entitlement, and PR association have not
been verified. A missing or mismatched association fails closed.

Workflow names and job names can be spoofed by someone able to alter workflow
definitions. Any actor able to dispatch workflows as `github-actions[bot]` may
also trigger trusted smoke runs, consuming usage; the dispatch guard does not
prove which workflow sent the dispatch. These guards rely on trusting
repository writers and the default branch.

Result validation retains these repository-specific inventory checks:

- Every expected native stimulus identity is present, and no unexpected
  stimulus identity is accepted.
- Each stimulus has exactly one result.
- Each stimulus has exactly its configured grader results.
- The result count matches the selected smoke/full suite, and no stimuli are
  skipped.

The workflow also gates on the eval Action outcome and step result. The result
validator receives JSONL but not the process exit status, so the Action gate
must reject a nonzero process exit even when the JSONL appears successful.

The original Promptfoo migration snapshot remains available in
[Git history](https://github.com/arielvalentin/agent-packages/blob/f85609e7966e4f8d2e80c909d0f96556e1dfe050/docs/evaluations-migration-map.json).

Thirty-one stimuli exercise root policy behavior. Their
profiles, instructions, or reference files are staged at supported workspace
instruction paths: `.github/copilot-instructions.md` and, when a second file
is needed, `AGENTS.md`. Vally 0.21.0 enables Copilot SDK configuration
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

The seven approved diagnostics are retained as native stimuli. Their assertion
failures are non-blocking only when the workflow confirms the Action reported a
failed evaluation. Action failures, missing or duplicate results, grader
mismatches, skipped stimuli, and all other failed graders remain blocking.
Offline preflight and strict-schema lint do not prove model behavior.

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

Shared-skill changes belong in `packages/agent-defaults`, the active canonical
source. The coordinator package was removed from current `main`; its published
tags remain unchanged for consumers pinned to those releases.

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
  a failure. Behavioral evaluations run in the credentialed GitHub Actions
  workflows; `npm test` remains offline.
- Hidden directories not visible: use `ls -la` or `tree -a`.
- Harness not auto-detected in consumer repo: pass `--target <harness>` or set `targets:` in consumer `apm.yml`.
