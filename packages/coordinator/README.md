# coordinator

Coordinator workflow package for delegated agent orchestration and gated reviews.

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

Use this package when you want a policy-driven coordinator that dispatches specialist agents, runs consensus review panels, and enforces review gates.

`human-interaction-safeguard` is the source of truth for public interaction
safety: human-authored and unknown-actor GitHub comments stop automation and
are routed to the user for a direct response, while verified bot/app feedback
may continue through automated review flows. `acting-on-behalf` enforces the
posting backstop.

Answer policy-only questions in the requested form without rendering a footer.
When composing public content, include the required fallback after safety,
posting-provenance, disclosure, and route decisions, without a separate request
for a footer. Returning only the body does not waive required disclosure.

Prefer verified built-in AI disclosure for the actual posting path in the
current client/configuration. Do not add a duplicate custom disclaimer.
When built-in disclosure is absent, insufficient, or unverified (including
unstated availability) and personal credentials or explicit user attribution
require disclosure, use exactly `> _AI-assisted._` (or a referenced
`[^ai]: AI-assisted.` footnote). Adequate disclosure identifies AI assistance,
authorship, or a known AI assistant, not just transport, automation, a username,
or a byline. Known bot/app/service posts without user attribution need no custom
fallback.

Only the custom fallback must be the final non-empty content in the supplied
body. Copy its Markdown markers verbatim, not just the rendered text. Do not
move, rewrite, or duplicate tool-managed disclosure. Keep the fixing commit SHA
in permitted bot/app feedback replies with either disclosure path or neither.

Verified example: [this App-managed reply](https://github.com/arielvalentin/agent-packages/pull/46#discussion_r4124650579)
was published under the user's personal account (REST `user.type=User`).
Its `reply_and_resolve_review_thread` mechanism added this note after the
supplied body:

> [!NOTE]
> Auto-replied by the [GitHub Copilot app](https://github.com/github/app).

Publishing provenance is independent of the host, CLI process, tool name, and
note. A CLI agent inside the Copilot App may use that same reply mechanism;
verify the actual mechanism/provider, not the host label or tool name.
In the same session, the retrieved PR body from
`create_pull_request`/`update_pull_request` had only the explicitly supplied
custom footer, not an automatic App note. Reply evidence does not establish
disclosure for an unchecked PR-body or comment/review mechanism.

The fallback contains no username, model, or provider metadata. Skip lookups
only when they serve solely to compose it; substantive attribution may still
need identity resolution. Unknown posting provenance still requires pausing and
asking, even with verified built-in disclosure. `HUMAN_STOP` still blocks
agent-authored replies and agent-performed resolution.
