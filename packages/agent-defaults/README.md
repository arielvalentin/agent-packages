# agent-defaults

Skills-only defaults for direct agent execution. This package installs no
coordinator agent and requires no mandatory coordinator routing.

## Includes

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
Run `apm install`. Invoke the appropriate agent directly and load skills when
their triggers apply. Delegate only when specialist context helps the task.
The calling agent owns task scope, review handoffs, synthesis, and user gates.
For review dispatches, the caller records `explicit_multi_review` as a JSON
boolean in every handoff; missing or invalid values fail closed.

Install this package alongside `development-workflow` or `code-reviewers`,
which reference its handoff, lifecycle, and review skills. These agent packages
do not bundle shared skills themselves.

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
for PR/template, validation, or policy/config questions, not automatically.

Load its [public-source calibration notes](.apm/skills/writing-voice/references/voice-patterns.md)
only when calibrating the voice or consulting historical evidence.
They ground the voice in concrete problem statements, focused questions, explicit
tradeoffs, and a distinction between requirements and nonblocking suggestions.
Synthetic examples live with the mode/artifact guidance, not in every mode's
historical-evidence dependency.
The notes document coverage and provenance limits; historical style never
overrides current preferences or authorizes first-person claims or posting.

Consumers that want always-on writing guidance should point their instructions
to `writing-voice` rather than duplicate its rules. Update `agent-defaults`
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

After a direct user request to override one concrete blocked action, the
safeguard can request an exact, fresh direct attestation. It authorizes one
attempt on the named target, not a task, thread, or session. Drafting, posting,
and resolution require separate authorization. Mismatches stay blocked, and
the interaction remains `HUMAN_STOP`. See the
[canonical ceremony](.apm/skills/human-interaction-safeguard/SKILL.md#single-action-attestation).
The pending challenge binds to the single concrete direct request; repeating
every target identifier is optional. Ambiguous or multiple actions remain
blocked, and a bare attestation without that request and challenge is invalid.
Literal matching uses the bundled Python 3.10+ verifier in a directly
user-operated, foreground POSIX terminal. It captures bytes itself; pipes,
input files, chat/tool replies, and model-reconstructed text are not accepted
input paths. Ctrl-D submits; Enter and editing keys are data and cause a
mismatch. Unsupported clients remain blocked.

The helper displays and hashes one private pending-request JSON record
(maximum 16 KiB), not independent action/digest arguments. Its launcher records
the child's actual completion status; anything other than current status 0
keeps the action blocked. The fresh literal-verification record is not an
authorization token. The client must independently establish direct human
control and preserve all source, scope, freshness, consumption, and posting
gates. A TTY is not identity proof, and the helper does not provide host-side
privilege enforcement. Never automate the terminal input.
Incomplete retrieval, pagination failures, missing/unverified actor metadata,
and an unavailable safeguard cannot be overridden. Posting permission,
identity, attribution, independent tool approvals, and higher-priority rules
still apply. This is a skill policy, not host-enforced identity verification.

Existing behavioral cases retain their local Ollama providers. Model-dependent
continuation fixtures execute the real interactive checker on their fixture
bytes before presenting its record; a failed check cannot fabricate a
successful record. Standard-library unit/PTY integration tests cover literal
98-byte acceptance, quoted 100-byte rejection, whitespace and other mutations,
and unsupported input channels. PTY fixtures simulate a terminal, not a human;
their TEST-ONLY records never authorize live work.

Review handoff validation does not replace public-interaction safeguards.
Research remains source-bounded fact finding, not duplicated consensus work.
