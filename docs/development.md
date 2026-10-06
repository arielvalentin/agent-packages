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
and consumers with:

```text
{{policy:<assertion-id>.<field>}}
```

When adding or changing an assertion:

1. Use a stable lowercase dotted ID and the version 1 required fields: `id`,
   `contract`, `actor`, `provenance`, `interaction`, `action`, `conditions`,
   `result`, `allowed`, and `precedence`.
   Conditions are stable condition IDs; precedence entries are canonical
   assertion IDs that must be established earlier. When precedence resolves
   conflicting decisions on the same contract surface, the overriding
   assertion must contain a strict superset of the overridden assertion's
   conditions; unrelated precedence links are rejected.
2. Add the ID to the required manifest in
   `packages/coordinator/tests/check-policy-assertions.cjs`. Removing an ID is
   intentionally backward-incompatible and must update that manifest.
3. Link the owning prose and every downstream policy consumer to the canonical
   record. Register each intentional consumer path in
   `packages/coordinator/tests/policy-assertion-consumers.cjs`; model assertions
   reject unregistered or inline consumer content. Every literal marker in
   repository Markdown is treated as a live consumer unless it is inside a
   Markdown code block identified by `markdown-it`, so fence documentation
   examples like the one above. List, blockquote, and paragraph continuations
   remain live prose unless the Markdown AST classifies them as code. Do not
   copy a second assertion record into a consumer.
4. Add the independently expected `result`, `allowed`, and contract signature
   to the manifest. The signature pins contract, actor, provenance,
   interaction, action, conditions, and precedence, so a registry edit cannot
   silently redefine either its outcome or the facts that select it.
5. Add deterministic parser/schema fixtures for new enum, reference,
   precedence, or ambiguity behavior. Scenario-based Promptfoo coverage uses
   `assert-policy-route.cjs` with `assertion_id`, `expected_result`, and
   `expected_allowed`; the model must return the exact result token. Permission
   scenarios use `assert-policy-permission.cjs` and an exact Yes/No response,
   while still verifying the canonical result and allowed state. Do not ask the
   model to read the assertion record back or infer policy from unrestricted
   free-form prose. The checker parses Promptfoo YAML with `js-yaml`; only
   direct test-level `vars` and `assert` fields count, regardless of mapping
   order or list-item formatting. If conflicting decisions are mutually
   exclusive, represent that with an existing condition group or extend the
   validator's reviewed mutually exclusive condition groups. The coordinator
   suite uses the completion provider by default and a filtered chat provider
   plus `tests/prompt.cjs` for exact multiline or permission output contracts;
   keep those provider/prompt filters local to the scenarios that require them.
6. Run:

   ```bash
   bash script/check-policy-assertions.sh
   bash script/check-consensus-contract.sh
   bash script/check-human-interaction-contract.sh
   npm run test:coordinator
   ```

The checker rejects malformed records, duplicate JSON keys or assertion IDs,
unknown fields or enums, unresolved or cyclic precedence, ambiguous overlapping
decisions without precedence, unresolved prose references, unreferenced
assertions, expected-outcome drift, and deterministic linked-marker
contradictions. General natural-language contradiction detection is
deliberately out of scope; linked-marker checks cover the marker's complete
logical sentence, including wrapped Markdown lines, and the structured record
remains authoritative.

## Troubleshooting

- Hidden directories not visible: use `ls -la` or `tree -a`.
- Harness not auto-detected in consumer repo: pass `--target <harness>` or set `targets:` in consumer `apm.yml`.
