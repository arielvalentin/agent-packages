# development-workflow

Design-and-implementation package for code and configuration changes, with
user-confirmed FedRAMP deployment approvals.

## Includes

- Agents:
  - `system-architect`
  - `implementer`
- Skill:
  - `fedramp-deployment-approval`

## Intent

Use this package when you want a structured path from design artifacts to implementation handoff.

## FedRAMP deployment approval

The `fedramp-deployment-approval` skill uses the computer-use server to inspect
an approval page in your existing signed-in Google Chrome session. It shows
the PR, full commit, review/approval state, and complete compliance attestation,
then asks for explicit permission for that one action. It rechecks the page,
clicks once, and verifies the resulting approval state. It never merges or
deploys, bypasses existing gates, or decides compliance for you.

Repository eligibility is controlled by
`~/.config/copilot/fedramp-deployment-approval.json`, not the installed skill:

```json
{"version": 1, "allowed_repositories": []}
```

The initial list is empty; a missing file has the same meaning. On first use
for an unlisted repository, the skill asks permission to add its exact
`host/owner/repo` identity, then saves only that confirmed entry. Entries use
lowercase host/full owner/repo (including a non-default PR host port). No
wildcards, inferred defaults, or automatic additions. Invalid/unreadable
policy blocks the flow. The bundled
[empty policy example](.apm/skills/fedramp-deployment-approval/references/allow-list.example.json)
does not grant eligibility or modify user configuration.

Adding a repository and submitting a compliance attestation are **separate
confirmations**. Eligibility grants no approval for any PR or commit. Removing
an entry from the policy revokes eligibility; the skill rechecks it before
clicking.

Request it with an exact approval-page URL and PR identity. Synthetic example:

```text
Use fedramp-deployment-approval to inspect
https://approvals.example.test/requests/42 for
https://github.com/example/service/pull/42.
Ask me before submitting the attestation.
```

Requirements: a signed-in Chrome session, discoverable computer-use tools,
file read/edit tools for the policy, `ask_user`, and the OS permissions
required by computer-use. A verified PR check link may supply the approval
URL. Missing or changed evidence, incomplete
required reviews, inaccessible approval controls, sign-in prompts, and unsafe
browser/OS warnings stop the flow. An uncertain click result is reported as
unknown, not retried. Each approval needs its own fresh confirmation.

## Consume through APM

This skill ships in the existing `development-workflow` package; consumers
such as dotfiles do not need a local/global skill override or a separate CLI.
After the change is published, update the consumer's package ref to a release
or commit containing the skill, then run the consumer's existing APM install
flow. For a project-scoped consumer use `apm install --target copilot`. Global
availability may use an existing user-managed global APM consumer; the policy
path and both confirmation requirements stay the same. This producer change
does not install or update host-global agent state. An older pinned ref will
not contain the skill.

For an unpublished checkout, opt into a project-local path dependency instead:

```yaml
dependencies:
  apm:
    - path: /absolute/path/to/agent-packages/packages/development-workflow
```

Use the changed worktree's package path, not an unchanged main checkout.
Replace the existing dependency rather than installing two copies. Local
validation should install only in a disposable consumer project, not into
host-global agent state. See the [consumption guide](../../docs/consumption.md)
for ref pinning.
