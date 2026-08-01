---
name: pr-feedback-review
description: >
  Structured protocol for reviewing, researching, and responding to PR review
  comments — whether implementing fixes or rebutting invalid concerns.
---

# PR Feedback Review

A structured protocol for reviewing, researching, and responding to PR review
comments. Load this skill when addressing PR feedback — whether implementing
fixes or rebutting invalid concerns.

## When to Use

- User asks to "address PR feedback", "respond to review comments", "handle
  PR reviews", or "resolve PR threads"
- Coordinator dispatches existing-PR-iteration flow
- Any request to review and act on PR comment threads

## Protocol

### Step 1: Read and Understand

Read **every** review comment and thread on the PR. For each comment:

- Identify the **specific concern** (correctness, style, performance, security,
  design, docs, etc.)
- Note whether it's a blocking request, suggestion, or question
- Understand the reviewer's reasoning — not just what they said, but *why*

Do not skim. Do not assume. If a comment is ambiguous, research before acting.

### Step 2: Research

For each concern, investigate:

- Read the code in question and surrounding context
- Check language/framework documentation and conventions
- Look at existing patterns in the repo (`AGENTS.md`, style guides, prior art)
- Consult relevant specs, RFCs, or official docs when the concern is about
  correctness or best practices
- Form your own informed conclusion about whether the feedback is valid

### Step 3: Decide and Act

For each comment thread, choose one:

#### Accept — the feedback is valid

1. Implement the fix (surgical change, don't over-correct)
2. Commit with a clear message referencing the concern
3. Reply to the comment:
   - Acknowledge the concern briefly
   - State `Fixed in <commit-sha>`
4. Resolve the thread

#### Rebut — the feedback is incorrect or misguided

1. Draft a respectful, evidence-based rebuttal
2. Include at least one of:
   - Link to official documentation
   - Link to language/framework spec
   - Code example showing why the current approach is correct
   - Reference to an existing repo convention or `AGENTS.md` rule
3. Reply to the comment with your rebuttal
4. **Do NOT resolve the thread** — let the reviewer decide

#### Clarify — the comment is ambiguous or needs discussion

1. Reply with a specific clarifying question
2. Do NOT resolve the thread
3. Do NOT implement speculative changes

### Step 4: Verify

After all comments are addressed:

1. Run the relevant test/lint/build commands to verify nothing broke
2. Resume `pr-lifecycle` Phase 4 if changes were pushed
3. Summarize actions taken:
   - Comments accepted (with commit SHAs)
   - Comments rebutted (with evidence cited)
   - Comments needing clarification (questions asked)

## Rules

- **Always load `acting-on-behalf`** before posting any reply
- **Never blindly apply** every suggestion — use judgement backed by evidence
- **Never ignore** valid concerns — if you're unsure, lean toward accepting
- **One commit per logical fix** when addressing multiple comments (don't lump
  unrelated fixes)
- **Keep fixes scoped** to what the reviewer asked — don't refactor adjacent code
- **Be respectful** in rebuttals — disagree with evidence, not attitude
