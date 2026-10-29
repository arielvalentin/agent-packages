---
name: repository-access
description: >
  Use when locating repositories, inspecting local or remote repository state,
  citing repository findings, or working with APM-managed skills and plugins.
---

# Repository access

## Find and inspect repositories

Prefer an existing local checkout when one is available. Inspect its current
branch, commit, and working-tree status before relying on its contents. Before
claiming that it reflects current remote state, identify the intended upstream
or target branch, refresh its remote reference when permitted, and compare the
local and remote SHAs, including whether the branch is ahead, behind, or
diverged. A successful fetch alone does not establish that the checkout is
current. Matching HEAD SHAs do not establish that modified or untracked files
are part of that commit. If references cannot be refreshed or compared,
identify the inspected commit SHA and state what remote state remains unknown;
identify uncommitted content separately or restrict claims to committed files.

Do not silently clone a repository that is not already available. Ask before
cloning, or continue with another authorized source.

For repository findings, cite the inspected commit SHA or a GitHub URL. Do not
present an inspected local snapshot as current remote state without checking it.
Use `writing-voice` to report source limits and distinguish inspected facts
from unknown remote state.

For public or shared output, follow `acting-on-behalf`'s audience-specific
disclosure boundary before using repository citations. Cite private
repository-local identifiers only in a verified private destination whose
audience is authorized to access that repository. It overrides the general
SHA-or-URL preference above.

## GitHub operations

For local repository state, use local `git`. For GitHub operations, follow
`acting-on-behalf`, which owns the `gh` CLI policy and posting safeguards.
Translate examples that name GitHub MCP into equivalent local `git` or `gh`
operations when applicable; do not invoke GitHub MCP just because an example
uses that name.

## APM-managed skills and plugins

When APM manages skills or plugins, update their authoritative source and any
existing manifest or configuration that declares them, not generated installed
copies. Do not create a manifest solely to edit a skill or plugin, or modify
unrelated configuration. Do not assume all consumers use the same source
repository, manifest, or private setup.
