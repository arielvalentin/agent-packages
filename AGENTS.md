# AGENTS.md

Instructions for AI agents working in this repository.

## Public content boundary

This repository is public. Do not add internal tooling, employer-specific
agents, private configuration, credentials, personal host/toolchain facts,
local filesystem paths, signing-key values, or private repository details,
including repository names, identifiers, commit SHAs/refs, URLs, and mappings.
Keep that material in a private repository.

## Commit authoring

For this repository, all commit subjects and PR titles must follow
[Conventional Commits](https://www.conventionalcommits.org/) and be at most
72 characters. The default, expected form is:

```
<type>: <short summary>

<optional body — explain WHY, not just WHAT>

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
```

Unless the user explicitly opts out, include the canonical Copilot co-author
trailer shown above.

The scoped form `<type>(<scope>): <short summary>` is valid but **optional**
— use it only when the scope materially clarifies the change (e.g., it isn't
obvious from the diff or PR context which package/area is affected). Don't
add a scope by default.

An optional `!` after the type/scope marks a breaking change: `<type>!: <short summary>` or `<type>(<scope>)!: <short summary>`.
Use `!` only for intentionally breaking changes. With this repository's
current release-please configuration (`release-type: simple`) and
pre-1.0 package versions, a `!` commit requests a `1.0.0` major release
and therefore requires explicit human approval before use.

### Types

| Type | Use when… |
|------|-----------|
| `feat` | Adding or changing user-facing behavior |
| `fix` | Correcting a bug |
| `docs` | Documentation-only changes |
| `refactor` | Restructuring code without changing behavior |
| `test` | Adding or updating tests |
| `chore` | Maintenance (dependency updates, non-CI/build tooling) |
| `ci` | CI pipeline/workflow configuration changes |
| `perf` | Performance improvements |
| `build` | Build system or external dependency changes |
| `revert` | Reverting a previous commit |

### Scope

When used, the scope should be the package or directory name most affected (e.g., `coordinator`, `implementer`, `ci`).

### Rules

1. **Sign every commit cryptographically.** Never disable signing or use an
   unsigned-commit override. Verify the cryptographic signature on each
   resulting commit before publishing. Unless the user explicitly opts out,
   include the canonical Copilot `Co-authored-by` trailer. The trailer does
   not replace the Git commit signature.
2. **Atomic commits** — each commit should represent one logical change.
3. **Present-tense imperative** — write summaries as commands (e.g., "add validation gate", not "added validation gate").
4. **Body explains intent** — if the summary alone doesn't convey _why_, add a body paragraph.
5. **No generated noise** — do not include tool output, debug logs, or LLM reasoning in commit messages.
6. **Reference issues** — if the work relates to a GitHub issue, include `Closes #N` or `Refs #N` in the body or footer.
7. **Validate before use** — for this repository, check the subject/title against `^(feat|fix|docs|refactor|test|chore|ci|perf|build|revert)(\([^()\s]+\))?!?:\s+\S.*` and ensure it is no more than 72 characters before committing, creating a PR, or marking a PR ready for review (via built-in PR tools or `gh`).

### Example

```
feat: add observability validation gate for PR readiness

Adds a mandatory gate that verifies code changes are observable in
production before declaring PR-ready. Checks metrics, logs, traces,
and alerting/SLO coverage.

Closes #42

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
```

Optional scoped variant — use only when the scope materially clarifies
which package/area is affected (e.g., not obvious from the diff):

```
feat(coordinator): add observability validation gate for PR readiness
```
