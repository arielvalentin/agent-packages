# AGENTS.md

Instructions for AI agents working in this repository.

## Commit authoring

All commits must follow [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <short summary>

<optional body — explain WHY, not just WHAT>

Co-authored-by: <agent name> <agent-email>
```

### Types

| Type | Use when… |
|------|-----------|
| `feat` | Adding or changing user-facing behavior |
| `fix` | Correcting a bug |
| `chore` | Maintenance (version bumps, CI config, dependency updates) |
| `refactor` | Restructuring code without changing behavior |
| `docs` | Documentation-only changes |
| `test` | Adding or updating tests |

### Scope

Use the package or directory name most affected (e.g., `coordinator`, `implementer`, `ci`).

### Rules

1. **Sign your work** — include a `Co-authored-by` trailer with the agent identity.
2. **Atomic commits** — each commit should represent one logical change.
3. **Present-tense imperative** — write summaries as commands (e.g., "add validation gate", not "added validation gate").
4. **Body explains intent** — if the summary alone doesn't convey _why_, add a body paragraph.
5. **No generated noise** — do not include tool output, debug logs, or LLM reasoning in commit messages.
6. **Reference issues** — if the work relates to a GitHub issue, include `Closes #N` or `Refs #N` in the body or footer.

### Example

```
feat(coordinator): add observability validation gate for PR readiness

Adds a mandatory gate that verifies code changes are observable in
production before declaring PR-ready. Checks metrics, logs, traces,
and alerting/SLO coverage.

Closes #42

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
```
