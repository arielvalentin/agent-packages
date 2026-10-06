# coordinator

Coordinator workflow package with a direct-work fast path and conditional
delegation/review policies.

## Includes

- Agent:
  - `coordinator`
- Skills:
  - `acting-on-behalf`
  - `adversarial-review`
  - `consensus-panel`
  - `handoff-envelope`
  - `human-interaction-safeguard`
  - `pr-feedback-review`
  - `pr-lifecycle`
  - `pr-review-protocol`
  - `resolve-github-user`
  - `review-fix-loop`
  - `stage-pr`
  - `tech-research`

## Intent

Use this package when you want a policy-driven coordinator that handles bounded
work directly, delegates only when separate context helps, and reserves
consensus or adversarial review for explicit or high-risk work.

Routine code work follows `inspect -> edit -> targeted validation -> final
response`, normally with no review gate and never more than one optional review
gate. One objective has one orchestration owner: either a delegated coordinator
or a parent managing narrow workers, never both.

`human-interaction-safeguard` is the source of truth for public interaction
safety: human-authored and unknown-actor GitHub comments stop automation and
are routed to the user for a direct response, while feedback with authoritative
Bot actor metadata may continue through automated review flows. GitHub App
association alone never overrides a User or unknown actor classification.
`acting-on-behalf` enforces the posting backstop.

When personal credentials or explicit user attribution require disclosure,
append a blank line and `> _AI Assisted._` after the supplied body. The
disclaimer needs no username, model, or provider lookup.

## Structured policy assertions

Behavior-defining routing and permission decisions use authoritative
`policy-assertions` JSONL fences in the owning Markdown skill or agent. Prose
remains the human explanation. Stable references such as
`{{policy:human-interaction.chain.any-human.result}}` link that prose and
downstream skills to the canonical record without duplicating policy.

Each fence starts with the version header and then one JSON object per
assertion. This non-authoritative example is wrapped in a generic outer fence:

````text
```policy-assertions
{"format":"policy-assertions","version":1}
{"id":"example.routing.case","contract":"example.routing","actor":"system","provenance":"policy-scope","interaction":"policy-change","action":"route","conditions":["example.condition"],"result":"CONTINUE","allowed":true,"precedence":[]}
```
````

`conditions` contains stable condition IDs. `precedence` lists canonical
assertion IDs that must be established earlier for this assertion to apply.

The checker fails closed on malformed JSON, duplicate keys or IDs, missing or
unknown fields, unknown enum values, unresolved precedence, unresolved
references, unreferenced assertions, and deterministic contradictions on a
linked marker line. It does not infer route or permission semantics from
unrestricted prose. Every policy marker in repository Markdown is audited as a
live consumer unless it appears inside a non-authoritative generic code fence.

Run `bash script/check-policy-assertions.sh` from the repository root after
adding or changing an assertion.

## Optional companion agents

The coordinator package remains usable on its own. When
`packages/development-workflow` is also installed, conditional architecture and
implementation handoffs use `arielvalentin: system-architect` and
`arielvalentin: implementer`. Without that companion package, the coordinator
keeps bounded work directly. `SE: Tech Writer` is optional; when unavailable,
requested documentation is written directly rather than failing dispatch.
