---
name: git-publishing-safety
description: >
  Use before creating or rewriting commits, rebasing, pushing, force-pushing,
  or opening a pull request. Enforces signing, commit/title conventions,
  history safety, and explicit publication authorization.
---

# Git publishing safety

Load before creating or rewriting commits, rebasing, pushing, force-pushing, or
opening a PR. Repository-specific commit/title formats and PR/issue workflows
take precedence over those defaults. They do not waive commit signing, the
default co-author trailer, publication authorization, or published-history
safeguards.

## Commit signing

Every commit must be signed. Before committing, amending, or rebasing, verify
that commit signing is enabled. Never disable signing or use an unsigned-commit
override such as `--no-gpg-sign`. If signing is unavailable or fails, stop and
report the failure; never retry the commit unsigned.

After creating or rewriting commits, verify that each resulting commit carries
a valid cryptographic signature before publishing. Enabled signing settings
alone are not proof. If signature verification is unavailable or fails, stop
and report it; do not publish the commit. Do not require separate signer
ownertrust or identity trust unless repository guidance requires it; successful
cryptographic verification is sufficient.

## Commit subjects and PR titles

When the repository does not require another format, use Conventional Commits
for commit subjects and PR titles, with a maximum of 72 characters. Use a scope
only when it materially clarifies the change. Add a body when the reason or
tradeoff is not obvious; omit it when the reason and tradeoff are clear.
Validate both the subject format and length before committing. For conventional
PR titles, validate the format and count the complete title separately; the
format regex alone does not enforce the 72-character maximum.
After a commit, amend, rebase, or other history rewrite, validate the format
and length of every resulting commit subject before publishing. Apply any
repository-required subject format instead of the Conventional default.
`pr-lifecycle` owns PR title format validation and repository-format
precedence.

## Co-author trailer

Every commit must include exactly the canonical Copilot trailer
`Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>`,
even when repository guidance specifies another commit-subject format, unless
the user explicitly opts out. Do not substitute another identity. The trailer
does not replace a cryptographic Git commit signature.

## Published history

Do not rewrite published history without the user's explicit approval. Before
rewriting a published branch, stop and ask if that approval is absent or
unclear. For an authorized force push, use `--force-with-lease`, preferably
with `--force-if-includes`; never use plain `--force` or `-f`. Do not use a
leading `+` refspec to bypass lease protection.

## Pushes and pull requests

Ask before pushing or opening a PR unless the user's request or repository
guidance already authorizes that action. A branch existing, a completed change,
or this skill's lifecycle advice is not authorization by itself. Follow the
repository's PR workflow; use the draft default only when PR creation is
authorized and repository guidance does not prescribe another readiness
workflow. Require a tracking issue only when repository guidance requires one.
Authorization to open a PR does not by itself authorize a push of an
unpublished branch. Before invoking `gh pr create`, confirm the branch is
already published or that the request or repository guidance also authorizes
the required push; otherwise ask before proceeding.

Use `writing-voice` when reporting a blocked or failed publication action.
