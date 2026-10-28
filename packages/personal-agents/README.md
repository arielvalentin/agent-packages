# personal-agents

Four personal variants of [Awesome Copilot](https://github.com/github/awesome-copilot)
agents without top-level `model` presets. Names, descriptions, tools, prompt
bodies and filenames are unchanged. These are owned source copies, not runtime
overrides or modifications to APM's installed supplier files.

An omitted `model` inherits the default model in
[GitHub Copilot](https://docs.github.com/en/copilot/reference/custom-agents-configuration)
and uses the selected model in
[VS Code](https://code.visualstudio.com/docs/agents/reference/custom-agent-file-reference).
Subagent selection is client-specific. This package does not choose a replacement
model or guarantee tool availability across clients.

## Includes

| File | Display name |
| --- | --- |
| `se-security-reviewer.agent.md` | SE: Security |
| `se-technical-writer.agent.md` | SE: Tech Writer |
| `custom-agent-foundry.agent.md` | Custom Agent Foundry |
| `agent-governance-reviewer.agent.md` | Agent Governance Reviewer |

There are no dependencies, hooks, instructions, skills, MCP definitions or
permission changes. The upstream tool lists remain intact, including
client-specific tools. The package does not grant tool permissions or bypass
repository instructions, interaction safeguards or user confirmation.

## Install

The local bootstrap version is `0.0.0`. The first proposed release is `0.1.0`;
it is not a published tag. After release, use a real package-specific tag:

```yaml
dependencies:
  apm:
    - arielvalentin/agent-packages/packages/personal-agents#<personal-agents-tag>
```

An exact published commit SHA can also be used. Then run:

```bash
apm install --target copilot
```

For user scope, declare the dependency in APM's user manifest and run
`apm install --global --target copilot`. APM deploys native agent files under
`~/.copilot/agents/`. Do not edit those managed copies.

Replace the four `github/awesome-copilot/agents/<filename>` dependencies listed
above before installing this bundle. Do not retain both sources or rely on
same-name shadowing. Reconcile any previously deployed supplier-owned files
through APM's ownership checks, not a force overwrite. Unrelated Awesome
Copilot agents can remain installed.

Earlier source revisions included Context Architect and Meta Agentic Project
Scaffold. They have been removed from this bundle. When upgrading, verify that
APM also removes their managed native files and that no separate dependency
reinstalls them. Refresh the client session before relying on its agent catalog;
an existing session may retain previously discovered profiles.

## Provenance and maintenance

All four agents come from
[`github/awesome-copilot` at `d75b41863510272ed217a3074c7045202b96e93f`](https://github.com/github/awesome-copilot/tree/d75b41863510272ed217a3074c7045202b96e93f/agents).
The only change is removal of each top-level frontmatter `model` line.
Model examples inside prompt bodies are deliberately unchanged.

[`provenance.json`](provenance.json) records each original source path, original
SHA-256, variant SHA-256, and the exact removed line and its original position.
[`LICENSE`](LICENSE) is the upstream MIT license, including GitHub's copyright
notice. These copied agents remain MIT-licensed, independent of the repository's
Apache-2.0 license.

Upstream updates are manual, reviewed source changes. Compare against the pinned
upstream blobs, remove only top-level model fields, refresh provenance, and run:

```bash
bash script/check-personal-agents.sh
```

Run this from the repository root. CI also compiles and audits the package.
No install-time transformations, model aliases or supplier fork are required.
