# Voice calibration

These public examples ground the requested `@arielvalentin` voice in observable
writing and collaboration. They are not a personality profile or a script to
repeat. Do not transfer the author's identity, experience, or authority to
another user. Current explicit preferences and required formats take precedence.
Posting and human-interaction gates remain outside this reference.

Load only for voice calibration or historical evidence/provenance,
not for every writing task. Reading a historical thread for research is not a
request to draft a reply to it. History never authorizes impersonation, posting,
human-thread replies, or resolution.

Keep quoted third-party text, templates, code, and generated material separate
from the user's narrative; do not infer human authorship from an account name,
a date range, or an absence of AI disclosure. Keep restricted examples out of
shared references.

## Evidence, not catchphrases

Sources were read on 2026-10-17. Dates below are creation/submission dates, not
proof of unaided authorship. The historical window was 2019-2025; earlier
examples anchor these observations. Later prose has uncertain AI provenance
and is corroboration only. Neither the account nor an absent AI disclosure
establishes human authorship.

| Recurring behavior | Dated public sources | Apply it without caricature |
|---|---|---|
| Concrete behavior before abstraction | [2019-03-28 PR](https://github.com/bigcommerce/gruf-lightstep/pull/6) identifies the missing `code` property and halted tracing. [2019-09-15 issue](https://github.com/signalfx/ruby-rails-instrumentation/issues/3) links timestamp behavior to affected traces and code changes. | Preserve supplied symbols, errors, and effects. Do not add an unsupported root cause. |
| A practical constraint explains the request | [2020-01-29 issue](https://github.com/lightstep/ls-trace-rb/issues/3) explains a migration that cannot upgrade every service at once. [2022-05-24 PR](https://github.com/open-telemetry/opentelemetry-ruby/pull/1280) explains why an absent host is legitimate in test stubs. | State why a change helps and what compatibility or operational cost it avoids. |
| Focused questions with visible uncertainty | [2019-08-30 issue](https://github.com/github/remote-input-element/issues/10) pairs an HTTP failure scenario with a code reference and a question. [2020-04-22 comment](https://github.com/DataDog/dogstatsd-ruby/issues/130#issuecomment-617796704) proposes a concrete test-socket option. [2021-09-30 discussion comment](https://github.com/open-telemetry/opentelemetry-ruby/discussions/966#discussioncomment-1406838) asks how the endpoint was verified before suggesting diagnostic steps. | Mark a hypothesis as a hypothesis and ask for the evidence that would distinguish it. Do not hedge every fact. |
| Questions and suggestions are not automatically blockers | [2021-05-14 inline review](https://github.com/open-telemetry/opentelemetry-ruby/pull/707#discussion_r632198586) asks about prior art and an experimental flag. [2022-05-18 inline review](https://github.com/open-telemetry/opentelemetry-ruby/pull/1265#discussion_r876144545) discusses design but explicitly does not hold back the update. [2023-03-28 review](https://github.com/open-telemetry/opentelemetry-ruby-contrib/pull/394#pullrequestreview-1361498605) separates required changes from open questions. | Preserve the stated level of obligation. Labels help when several kinds of feedback coexist, but are not required headings for every note. |
| Firm technical boundaries can coexist with humility | [2022-10-03 inline review](https://github.com/open-telemetry/opentelemetry-ruby-contrib/pull/133#discussion_r986083850) explains the server/client error distinction while acknowledging limited framework familiarity. | State the constraint and rationale directly without attacking the contributor or pretending to know an unfamiliar system. |
| Specific thanks and ownership of corrections | [2019-01-02 comment](https://github.com/dry-rb/dry-system/pull/99#issuecomment-450896906) thanks a reviewer before asking about the attempted approach. [2021-11-25 inline comment](https://github.com/open-telemetry/opentelemetry-ruby/pull/1026#discussion_r756989193) acknowledges a mistaken reading. [2022-06-26 review](https://github.com/open-telemetry/opentelemetry-ruby-contrib/pull/62#pullrequestreview-1019446986) thanks a contributor for patience and incorporating feedback. | Keep warranted warmth and acknowledge the actual mistake. Avoid generic praise and repeated apologies. |
| Reconsider a tradeoff rather than manufacture consensus | [2023-07-27 comment](https://github.com/open-telemetry/opentelemetry-ruby/pull/1500#issuecomment-1653427933) explains the original caution, recognizes the compatibility objection, and revises the proposed constraint. | Explain what changed the reasoning. Do not infer the user's agreement or promise an action they did not authorize. |

Support is strongest for concrete explanations, focused questions, and
context-dependent feedback. The tradeoff revision is an illustrative case,
not proof of a universal habit. Historical counterexamples include enthusiastic
thanks, emojis, long explanations, and terse one-line fixes. Some headings come
from repository templates. Do not imitate typos, copy domain-specific claims
into a different context, mandate an emoji or catchphrase, or reduce this voice
to "always terse." Third-party blockquotes and specification quotations are
evidence being cited, not the user's own phrasing.

The research inventory covered 4,201 public records across 44 repositories;
93 excerpts/narratives across 23 repositories were inspected. It is not an
exhaustive reading or statistically representative sample: 94.2% of retrieved
public records came from two Ruby OpenTelemetry repositories. Review discovery
used annual contribution connections and can omit activity. Current API text
can include later edits. No private examples or raw corpus belong here.

Synthetic examples live with the relevant
[proposal/discussion](proposal-discussion.md), [review](review.md),
[defect](defect.md), and [artifact-authoring](artifact-authoring.md) guidance.
They grant no permission to draft or post on `HUMAN_STOP` and are not real
measurements, user experience, or historical quotations.
