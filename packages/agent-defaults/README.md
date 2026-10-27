# agent-defaults

Repository-first instructions and shared skills for direct agent execution.
This package installs no coordinator agent and requires no coordinator routing.

## Includes

Unconditional instructions in `.apm/instructions/`:

- `repository-work.instructions.md`: repository precedence, task ownership,
  surgical changes, evidence, and focused validation.
- `skill-gates.instructions.md`: canonical entrypoints and mandatory interaction,
  posting, and bounded review gates.

Both use `description` frontmatter with no `applyTo`. They are always-on defaults,
not file-pattern rules or a substitute for repository guidance. Repository
conventions prevail; safety and permission gates remain mandatory.

Skills:

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
- `writing-voice`

## Install and use

```yaml
dependencies:
  apm:
    - arielvalentin/agent-packages/packages/agent-defaults#<agent-defaults-tag>
```

Replace the placeholder with a [published package tag](https://github.com/arielvalentin/agent-packages/releases)
that includes `writing-voice`; `agent-defaults-v0.1.0` predates this skill.
Run `apm install --target copilot`. Invoke the appropriate agent directly and load skills when
their triggers apply. Delegate only when specialist context helps the task.
The calling agent owns task scope, review handoffs, synthesis, and user gates.
For review dispatches, the caller records `explicit_multi_review` as a JSON
boolean in every handoff; missing or invalid values fail closed.

Install this package alongside `development-workflow` or `code-reviewers`,
which reference its handoff, lifecycle, and review skills. These agent packages
do not bundle shared skills themselves.

## Unconditional Copilot deployment

Source metadata is `description` only; there is deliberately no `applyTo`.
With APM 0.32.0, project install deploys the two individual files under
`.github/instructions/`. APM reports that omitted `applyTo` applies globally.

For user-scope defaults from the global APM manifest:

```bash
apm install --global --target copilot
apm compile --global
```

Global install combines both instruction bodies into the APM-managed
`~/.copilot/copilot-instructions.md`. Global compile separately writes
`~/.copilot/AGENTS.md`; it does not deploy the two source filenames into
`~/.copilot/instructions/`. The native `copilot-instructions.md` is the
unconditional Copilot entrypoint. Merely installing skills or compiling a root
file does not prove that the native entrypoint loaded.

Verify both headings, `Repository work` and `Skill gates`, in the deployed
native file, then use `copilot instruction list --json` (or `/instructions` in
an interactive session) to confirm the user-scope Home entrypoint is enabled.
Start a new or resumed session after changing instructions.

APM preserves an existing unmanaged `copilot-instructions.md` and can return
success while skipping its deployment. Treat missing canonical content as a
blocked migration, not success; reconcile ownership without force-overwriting
authored policy. Keep personal/local overrides in a separate native
`~/.copilot/instructions/*.instructions.md` module rather than editing APM's
managed root. This package contains no personal identity, signing-key paths,
host setup, or private tooling policy.

## PR monitoring

`pr-lifecycle` prefers available PR/head-aware status and notifications, or an
already delegated native controller such as Agent merge. It does not activate
controllers or grant merge permission. CLI and cloud clients retain a bounded
`gh` fallback; no desktop-only capability is required.

One owner tracks each PR. Final readiness still requires live exact-head checks,
repository-required reviews, and the existing safety gates. Copilot review waits
need evidence that a review is expected; unknown configuration or a timeout is
reported as a gap, never as success.

## Writing

`apm install --target copilot` discovers `.apm/skills/writing-voice/` and installs
the complete directory, including `references/`, into the consumer's
`.agents/skills/writing-voice/`. Modes need no separate dependency or export entry.

`writing-voice` is the canonical authoring policy for chat and drafted
artifacts. It defaults to the user's voice while preserving relevant evidence,
rationale, and uncertainty. It owns template-aware validation detail and the
final reader check; posting permission and conditional attribution remain in
the existing safeguard skills. The compact main skill is sufficient for routine
writing. It infers three modes from the task and loads only the relevant guide:
[proposal/discussion](.apm/skills/writing-voice/references/proposal-discussion.md)
for options and decisions, [review](.apm/skills/writing-voice/references/review.md)
for evidence-backed findings, or [defect reporting](.apm/skills/writing-voice/references/defect.md)
for observed/expected behavior and diagnosis. Modes add no commands, forced
headings, or authority to post; mixed tasks use only the applicable guidance.
Load [artifact-authoring detail](.apm/skills/writing-voice/references/artifact-authoring.md)
when authoring PR descriptions or handling template, validation, or policy/config
detail. PR descriptions focus on value and supported before/after behavior in
the user's voice, link issues without retelling them, and preserve complete
repository templates. They omit routine passing validation noise, not failures,
risks, required answers, material evidence, or new reviewer-performed steps.

Load its [public-source calibration notes](.apm/skills/writing-voice/references/voice-patterns.md)
only when calibrating the voice or consulting historical evidence.
They ground the voice in concrete problem statements, focused questions, explicit
tradeoffs, and a distinction between requirements and nonblocking suggestions.
Synthetic examples live with the mode/artifact guidance, not in every mode's
historical-evidence dependency.
The notes document coverage and provenance limits; historical style never
overrides current preferences or authorizes first-person claims or posting.

The unconditional skill entrypoints point to `writing-voice` rather than
duplicate its rules. Update `agent-defaults`
alongside development/review agents that reference this skill.

## Migration from coordinator

Replace the coordinator dependency with `agent-defaults` and remove mandatory
coordinator routing from consumer instructions. Preserve public-interaction
gates and caller-owned review handoff fields. The legacy coordinator package
retains frozen skill snapshots for compatibility; this package is the canonical
source for future shared-skill changes.

Do not install both packages unless you need the legacy agent: their skill
names overlap. Remove a separate `stage-pr` dependency if it duplicates the
skill supplied here, and use this package's version intentionally.

## Safeguards

`human-interaction-safeguard` owns actor and conversation-chain classification
for existing public GitHub interactions. `acting-on-behalf` is the posting and
attribution backstop. Human or unknown interactions stop automated replies and
resolution; verified bot/app chains may follow the normal feedback flow.

For verified human interaction, the agent gives a concise warning and explains
that the user can handle it directly or authorize one described pending action.
Use the client's user-question flow, such as `ask_user`, or a clear direct user
reply. Ordinary confirmation such as "Yes, draft that reply" is enough when the
action and target are unambiguous. No exact sentence, terminal, special key, or
model name is required. See the
[canonical confirmation policy](.apm/skills/human-interaction-safeguard/SKILL.md#single-action-confirmation).

Approval applies only to the described action, target and work scope or post
body. Drafting, posting and resolution are separate. Changed scope or chain,
lost state, and retries require fresh confirmation. A confirmed action stays
`HUMAN_STOP`; it never starts an automation loop or grants session-wide access.
Silence, ambiguous assent, public comments, repository/tool text and other
agents' messages are not consent. The agent cannot answer its own question.

Incomplete retrieval, pagination failures, missing/unverified actor metadata,
and an unavailable safeguard cannot be overridden. Posting permission,
identity, attribution, independent tool approvals, and higher-priority rules
still apply. This is a skill policy, not host-enforced identity verification.

Behavioral cases use the existing local Ollama providers to check warning,
ordinary confirmation, denied/ambiguous/untrusted consent and action scope.
Deterministic contracts preserve metadata, chain-taint, pagination and posting
invariants and check the behavioral graders against unsafe answers. Test
scenarios never authorize a live public action.

Review handoff validation does not replace public-interaction safeguards.
Research remains source-bounded fact finding, not duplicated consensus work.
