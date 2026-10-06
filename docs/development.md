# Development guide

## Prerequisites

- APM installed (`apm --version`)
- Git configured for signed commits if you plan to publish changes

## Working with package contents

Use the canonical `.apm/` path while editing:

```bash
cd packages/coordinator
tree -a .apm
```

## Local validation

From an individual package directory:

```bash
apm install --target copilot
```

From a consumer test repository, point at a local path dependency if needed:

```yaml
dependencies:
  apm:
    - path: /absolute/path/to/agent-packages/packages/coordinator
```

Then run:

```bash
apm install
```

## Recommended change workflow

1. Edit primitives in one package.
2. Validate in a small consumer project.
3. Commit changes with a clear Conventional Commits message (see
   [AGENTS.md](../AGENTS.md#commit-authoring)) — unscoped by default;
   add a `(<scope>)` only when the package/area isn't obvious from the diff.
4. Tag and publish/release when stable.

## Editing coordinator policy assertions

Coordinator routing and permission contracts use fenced
`policy-assertions` JSON Lines records. Keep the canonical assertion in the
skill or agent that owns the policy, then reference it from explanatory prose
and consumers with `{{policy:<assertion-id>.<field>}}`.

When adding or changing an assertion:

1. Use a stable lowercase dotted ID and the version 1 required fields: `id`,
   `contract`, `actor`, `provenance`, `interaction`, `action`, `conditions`,
   `result`, `allowed`, and `precedence`.
   Conditions are stable condition IDs; precedence entries are canonical
   assertion IDs that must be established earlier.
2. Add the ID to the required manifest in
   `packages/coordinator/tests/check-policy-assertions.cjs`. Removing an ID is
   intentionally backward-incompatible and must update that manifest.
3. Link the owning prose and every downstream policy consumer to the canonical
   record. Do not copy a second assertion record into a consumer.
4. Add deterministic parser/schema fixtures for new enum or reference behavior.
   Promptfoo policy decisions must return
   `{"assertion_id":"...","result":"...","allowed":true|false}` and use
   `assert-policy-decision.cjs`; do not infer policy from free-form model prose.
5. Run:

   ```bash
   bash script/check-policy-assertions.sh
   bash script/check-consensus-contract.sh
   bash script/check-human-interaction-contract.sh
   npm run test:coordinator
   ```

The checker rejects malformed records, duplicate JSON keys or assertion IDs,
unknown fields or enums, unresolved precedence and prose references,
unreferenced assertions, and deterministic linked-marker contradictions.
General natural-language contradiction detection is deliberately out of scope;
the structured record is authoritative.

## Troubleshooting

- Hidden directories not visible: use `ls -la` or `tree -a`.
- Harness not auto-detected in consumer repo: pass `--target <harness>` or set `targets:` in consumer `apm.yml`.
